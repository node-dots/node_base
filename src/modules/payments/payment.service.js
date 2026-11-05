import { createHash } from "node:crypto";
import { AppError, ResourceNotFoundError } from "../../utils/errors.js";
import { PERMISSIONS } from "../../utils/access/permissions.js";
import { systemClock } from "../../utils/calendar.js";
import { annualPaymentDeadline } from "../invoices/invoice.calculations.js";
import {
  confirmPaymentSchema,
  createPendingPaymentSchema,
} from "./payment.schema.js";

function hashPayload({ invoiceId, amountCents, method, payerPersonId }) {
  return createHash("sha256")
    .update(JSON.stringify({ invoiceId, amountCents, method, payerPersonId }))
    .digest("hex");
}

function toPublicPayment(payment) {
  const { id, invoiceId, amountCents, method, status, reportedAt } = payment;
  return {
    id,
    invoiceId,
    amountCents,
    method,
    status,
    reportedAt,
    ...(payment.occurredAt ? { occurredAt: payment.occurredAt } : {}),
    ...(payment.confirmedAt ? { confirmedAt: payment.confirmedAt } : {}),
    ...(payment.rejectedAt ? { rejectedAt: payment.rejectedAt } : {}),
  };
}

export class PaymentService {
  constructor({
    paymentRepository,
    invoiceRepository,
    childRepository,
    authorizer,
    unitOfWork,
    clock = systemClock,
  }) {
    Object.assign(this, {
      paymentRepository,
      invoiceRepository,
      childRepository,
      authorizer,
      unitOfWork,
      clock,
    });
    authorizer.assertKnown(PERMISSIONS.PAYMENTS_CREATE);
    authorizer.assertKnown(PERMISSIONS.PAYMENTS_CONFIRM);
    authorizer.assertKnown(PERMISSIONS.PAYMENTS_REJECT);
  }

  async reportPending(input, actor, requestId) {
    this.authorizer.assertPermission(actor, PERMISSIONS.PAYMENTS_CREATE);
    try {
      input = createPendingPaymentSchema.parse(input);
    } catch (error) {
      throw new AppError(
        400,
        "INVALID_PAYMENT_REPORT",
        "Payment report is invalid",
        error.issues,
      );
    }
    const invoice = await this.invoiceRepository.findById(input.invoiceId);
    if (!invoice)
      throw new ResourceNotFoundError("INVOICE_NOT_FOUND", "Invoice not found");
    const child = await this.childRepository.findById(invoice.childId);
    if (!child)
      throw new ResourceNotFoundError("INVOICE_NOT_FOUND", "Invoice not found");
    const isParent = actor.roles.includes("PARENT");
    let payerPersonId;
    if (isParent) {
      if (input.payerPersonId)
        throw new AppError(
          403,
          "PAYER_FORBIDDEN",
          "Payer is determined by the authenticated parent",
        );
      if (!child.guardians.some(({ personId }) => personId === actor.id))
        throw new ResourceNotFoundError(
          "INVOICE_NOT_FOUND",
          "Invoice not found",
        );
      payerPersonId = actor.id;
    } else {
      payerPersonId = input.payerPersonId ?? actor.id;
      if (!child.guardians.some(({ personId }) => personId === payerPersonId))
        throw new AppError(
          400,
          "PAYER_NOT_GUARDIAN",
          "Payer must be a verified child representative",
        );
    }
    const payloadHash = hashPayload({ ...input, payerPersonId });
    const key = { actorId: actor.id, idempotencyKey: input.idempotencyKey };
    const existing = await this.paymentRepository.findByIdempotency(key);
    if (existing)
      return toPublicPayment(this.assertSamePayload(existing, payloadHash));
    if (invoice.status === "CANCELLED")
      throw new ResourceNotFoundError("INVOICE_NOT_FOUND", "Invoice not found");
    if (
      invoice.billingType === "ANNUAL" &&
      input.amountCents !== invoice.remainingAmountCents
    )
      throw new AppError(
        409,
        "ANNUAL_PAYMENT_MUST_BE_FULL",
        "Annual tuition must be paid in one full payment",
      );
    if (input.amountCents > invoice.remainingAmountCents)
      throw new AppError(
        409,
        "PAYMENT_EXCEEDS_BALANCE",
        "Reported payment exceeds the invoice balance",
      );

    const now = this.clock.now();
    const payment = {
      invoiceId: input.invoiceId,
      amountCents: input.amountCents,
      method: input.method,
      status: "PENDING",
      payerPersonId,
      actorId: actor.id,
      idempotencyKey: input.idempotencyKey,
      payloadHash,
      reportedAt: now,
    };
    try {
      const created = await this.unitOfWork.execute(
        async ({ session, recordAudit }) => {
          const prior = await this.paymentRepository.findByIdempotency(key, {
            session,
          });
          if (prior) return this.assertSamePayload(prior, payloadHash);
          const result = await this.paymentRepository.insert(payment, {
            session,
          });
          await recordAudit({
            actorId: actor.id,
            requestId,
            action: "payment.report.pending",
            entityType: "PAYMENT",
            entityId: result.id,
            after: {
              invoiceId: input.invoiceId,
              amountCents: input.amountCents,
              method: input.method,
              status: "PENDING",
            },
            safeFields: ["invoiceId", "amountCents", "method", "status"],
          });
          return result;
        },
      );
      return toPublicPayment(created);
    } catch (error) {
      if (error?.code !== 11000) throw error;
      return toPublicPayment(
        this.assertSamePayload(
          await this.paymentRepository.findByIdempotency(key),
          payloadHash,
        ),
      );
    }
  }

  async confirm(paymentId, input, actor, requestId) {
    this.authorizer.assertPermission(actor, PERMISSIONS.PAYMENTS_CONFIRM);
    let occurredAt;
    try {
      occurredAt = new Date(confirmPaymentSchema.parse(input).occurredAt);
    } catch (error) {
      throw new AppError(
        400,
        "INVALID_PAYMENT_CONFIRMATION",
        "Payment confirmation is invalid",
        error.issues,
      );
    }
    const now = this.clock.now();
    if (occurredAt > now)
      throw new AppError(
        400,
        "PAYMENT_OCCURRED_IN_FUTURE",
        "Payment occurrence time cannot be in the future",
      );

    return this.unitOfWork.execute(async ({ session, recordAudit }) => {
      const payment = await this.paymentRepository.findById(paymentId, {
        session,
      });
      if (!payment)
        throw new ResourceNotFoundError(
          "PAYMENT_NOT_FOUND",
          "Payment not found",
        );
      if (payment.status === "CONFIRMED") return toPublicPayment(payment);
      if (payment.status !== "PENDING")
        throw new AppError(
          409,
          "PAYMENT_STATE_CONFLICT",
          "Only pending payments can be confirmed",
        );

      const invoiceBefore = await this.invoiceRepository.findById(
        payment.invoiceId,
        { session },
      );
      if (!invoiceBefore)
        throw new ResourceNotFoundError(
          "INVOICE_NOT_FOUND",
          "Invoice not found",
        );
      if (invoiceBefore.billingType === "ANNUAL") {
        const deadline = annualPaymentDeadline(invoiceBefore.serviceMonth);
        if (occurredAt > deadline || now > deadline)
          throw new AppError(
            409,
            "ANNUAL_PAYMENT_DEADLINE_PASSED",
            "Annual tuition payment must be received and confirmed before its first month",
          );
        if (
          payment.amountCents !== invoiceBefore.remainingAmountCents ||
          payment.amountCents !== invoiceBefore.origAmountCents
        )
          throw new AppError(
            409,
            "ANNUAL_PAYMENT_MUST_BE_FULL",
            "Annual tuition must be paid in one full payment",
          );
      }

      const invoice = await this.invoiceRepository.applyReceipt(
        payment.invoiceId,
        payment.amountCents,
        { session },
      );
      if (!invoice)
        throw new AppError(
          409,
          "PAYMENT_EXCEEDS_BALANCE",
          "Payment exceeds the current invoice balance",
        );
      const confirmed = await this.paymentRepository.confirmPending(
        payment.id,
        { occurredAt, confirmedAt: now, reviewedById: actor.id },
        { session },
      );
      if (!confirmed)
        throw new AppError(
          409,
          "PAYMENT_STATE_CONFLICT",
          "Payment was changed by another operation",
        );
      await recordAudit({
        actorId: actor.id,
        requestId,
        action: "payment.confirm",
        entityType: "PAYMENT",
        entityId: payment.id,
        before: { status: "PENDING" },
        after: {
          invoiceId: payment.invoiceId,
          amountCents: payment.amountCents,
          status: "CONFIRMED",
          occurredAt: occurredAt.toISOString(),
          confirmedAt: now.toISOString(),
        },
        safeFields: [
          "invoiceId",
          "amountCents",
          "status",
          "occurredAt",
          "confirmedAt",
        ],
      });
      return toPublicPayment(confirmed);
    });
  }

  async reject(paymentId, actor, requestId) {
    this.authorizer.assertPermission(actor, PERMISSIONS.PAYMENTS_REJECT);
    const now = this.clock.now();
    return this.unitOfWork.execute(async ({ session, recordAudit }) => {
      const payment = await this.paymentRepository.findById(paymentId, {
        session,
      });
      if (!payment)
        throw new ResourceNotFoundError(
          "PAYMENT_NOT_FOUND",
          "Payment not found",
        );
      if (payment.status === "REJECTED") return toPublicPayment(payment);
      if (payment.status !== "PENDING")
        throw new AppError(
          409,
          "PAYMENT_STATE_CONFLICT",
          "Only pending payments can be rejected",
        );
      const rejected = await this.paymentRepository.rejectPending(
        payment.id,
        { rejectedAt: now, reviewedById: actor.id },
        { session },
      );
      if (!rejected)
        throw new AppError(
          409,
          "PAYMENT_STATE_CONFLICT",
          "Payment was changed by another operation",
        );
      await recordAudit({
        actorId: actor.id,
        requestId,
        action: "payment.reject",
        entityType: "PAYMENT",
        entityId: payment.id,
        before: { status: "PENDING" },
        after: { invoiceId: payment.invoiceId, status: "REJECTED" },
        safeFields: ["invoiceId", "status"],
      });
      return toPublicPayment(rejected);
    });
  }

  assertSamePayload(payment, payloadHash) {
    if (!payment || payment.payloadHash !== payloadHash)
      throw new AppError(
        409,
        "IDEMPOTENCY_KEY_CONFLICT",
        "Idempotency key was already used with a different payload",
      );
    return payment;
  }
}
