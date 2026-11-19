import { createHash } from "node:crypto";
import { AppError, ResourceNotFoundError } from "../../utils/errors.js";
import { PERMISSIONS } from "../../utils/access/permissions.js";
import { getServiceMonthUtcRange, systemClock } from "../../utils/calendar.js";
import { annualPaymentDeadline } from "../invoices/invoice.calculations.js";
import {
  confirmPaymentSchema,
  createPendingPaymentSchema,
  refundPaymentSchema,
} from "./payment.schema.js";

function hashPayload({ invoiceId, amountCents, method, payerPersonId }) {
  return createHash("sha256")
    .update(JSON.stringify({ invoiceId, amountCents, method, payerPersonId }))
    .digest("hex");
}

function hashRefundPayload({ paymentId, amountCents, reason }) {
  return createHash("sha256")
    .update(JSON.stringify({ paymentId, amountCents, reason }))
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
    refundRepository,
    authorizer,
    unitOfWork,
    clock = systemClock,
  }) {
    Object.assign(this, {
      paymentRepository,
      invoiceRepository,
      childRepository,
      refundRepository,
      authorizer,
      unitOfWork,
      clock,
    });
    authorizer.assertKnown(PERMISSIONS.PAYMENTS_CREATE);
    authorizer.assertKnown(PERMISSIONS.PAYMENTS_CONFIRM);
    authorizer.assertKnown(PERMISSIONS.PAYMENTS_REJECT);
    authorizer.assertKnown(PERMISSIONS.PAYMENTS_REFUND);
    authorizer.assertKnown(PERMISSIONS.REPORTS_FINANCE_READ);
  }

  async listForMonth({ month, page, pageSize }, actor) {
    this.authorizer.assertPermission(actor, PERMISSIONS.REPORTS_FINANCE_READ);
    const { start, end } = getServiceMonthUtcRange(month);
    const { payments, total } = await this.paymentRepository.findPageForPeriod({
      start,
      end,
      page,
      pageSize,
    });
    return {
      payments: payments.map(toPublicPayment),
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    };
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

  async refund(paymentId, input, actor, requestId) {
    this.authorizer.assertPermission(actor, PERMISSIONS.PAYMENTS_REFUND);
    if (!this.refundRepository)
      throw new TypeError("refundRepository is required for refunds");
    let parsed;
    try {
      parsed = refundPaymentSchema.parse(input);
    } catch (error) {
      throw new AppError(
        400,
        "INVALID_REFUND",
        "Refund request is invalid",
        error.issues,
      );
    }
    const payloadHash = hashRefundPayload({ paymentId, ...parsed });
    const key = { actorId: actor.id, idempotencyKey: parsed.idempotencyKey };
    const existing = await this.refundRepository.findByIdempotency(key);
    if (existing) return this.assertSameRefundPayload(existing, payloadHash);
    const now = this.clock.now();
    try {
      return await this.unitOfWork.execute(async ({ session, recordAudit }) => {
        const prior = await this.refundRepository.findByIdempotency(key, {
          session,
        });
        if (prior) return this.assertSameRefundPayload(prior, payloadHash);
        const payment = await this.paymentRepository.findById(paymentId, {
          session,
        });
        if (!payment)
          throw new ResourceNotFoundError(
            "PAYMENT_NOT_FOUND",
            "Payment not found",
          );
        if (payment.status !== "CONFIRMED")
          throw new AppError(
            409,
            "REFUND_REQUIRES_CONFIRMED_RECEIPT",
            "A refund must reference a confirmed receipt",
          );
        const invoice = await this.invoiceRepository.findById(
          payment.invoiceId,
          {
            session,
          },
        );
        if (!invoice)
          throw new ResourceNotFoundError(
            "INVOICE_NOT_FOUND",
            "Invoice not found",
          );
        const child = this.childRepository.findByIdForUpdate
          ? await this.childRepository.findByIdForUpdate(invoice.childId, {
              session,
            })
          : await this.childRepository.findById(invoice.childId);
        if (!child)
          throw new ResourceNotFoundError(
            "INVOICE_NOT_FOUND",
            "Invoice not found",
          );
        if (
          payment.invoiceId !== invoice.id ||
          child.status !== "LEFT" ||
          !child.withdrawalSummary
        )
          throw new AppError(
            409,
            "REFUND_NOT_ELIGIBLE",
            "Refunds are available only for a withdrawn child's recorded obligation",
          );
        if (parsed.amountCents > (invoice.refundableAmountCents ?? 0))
          throw new AppError(
            409,
            "REFUND_EXCEEDS_INVOICE_DUE",
            "Refund exceeds the remaining refundable invoice amount",
          );
        if (parsed.amountCents > child.withdrawalSummary.refundDueCents)
          throw new AppError(
            409,
            "REFUND_EXCEEDS_CHILD_DUE",
            "Refund exceeds the child's remaining refund due",
          );

        const paymentReservation = await this.paymentRepository.reserveRefund(
          payment.id,
          parsed.amountCents,
          { session },
        );
        if (!paymentReservation)
          throw new AppError(
            409,
            "REFUND_EXCEEDS_RECEIPT_BALANCE",
            "Refund exceeds the unrefunded balance of this receipt",
          );
        const invoiceReservation = await this.invoiceRepository.reserveRefund(
          invoice.id,
          parsed.amountCents,
          { session },
        );
        if (!invoiceReservation)
          throw new AppError(
            409,
            "REFUND_EXCEEDS_INVOICE_DUE",
            "Another refund used the remaining refundable invoice amount",
          );
        const childReservation =
          await this.childRepository.decrementWithdrawalRefundDue(
            child.id,
            parsed.amountCents,
            { session },
          );
        if (!childReservation)
          throw new AppError(
            409,
            "REFUND_EXCEEDS_CHILD_DUE",
            "Another refund used the child's remaining refund due",
          );
        const refund = await this.refundRepository.insert(
          {
            paymentId: payment.id,
            invoiceId: invoice.id,
            childId: child.id,
            actorId: actor.id,
            amountCents: parsed.amountCents,
            reason: parsed.reason,
            idempotencyKey: parsed.idempotencyKey,
            payloadHash,
            status: "CONFIRMED",
            recordedAt: now,
          },
          { session },
        );
        await recordAudit({
          actorId: actor.id,
          requestId,
          action: "payment.refund.record",
          entityType: "REFUND",
          entityId: refund.id,
          after: {
            paymentId: payment.id,
            invoiceId: invoice.id,
            amountCents: parsed.amountCents,
            status: "CONFIRMED",
          },
          safeFields: ["paymentId", "invoiceId", "amountCents", "status"],
        });
        return refund;
      });
    } catch (error) {
      if (error?.code !== 11000) throw error;
      const duplicate = await this.refundRepository.findByIdempotency(key);
      if (duplicate)
        return this.assertSameRefundPayload(duplicate, payloadHash);
      throw error;
    }
  }

  async listRefunds(paymentId, actor) {
    this.authorizer.assertPermission(actor, PERMISSIONS.PAYMENTS_READ);
    if (!this.refundRepository)
      throw new TypeError("refundRepository is required for refunds");
    const payment = await this.paymentRepository.findById(paymentId);
    if (!payment)
      throw new ResourceNotFoundError("PAYMENT_NOT_FOUND", "Payment not found");
    const invoice = await this.invoiceRepository.findById(payment.invoiceId);
    if (!invoice)
      throw new ResourceNotFoundError("PAYMENT_NOT_FOUND", "Payment not found");
    const child = await this.childRepository.findById(invoice.childId);
    if (!child)
      throw new ResourceNotFoundError("PAYMENT_NOT_FOUND", "Payment not found");
    if (
      actor.roles.includes("PARENT") &&
      !child.guardians.some(({ personId }) => personId === actor.id)
    )
      throw new ResourceNotFoundError("PAYMENT_NOT_FOUND", "Payment not found");
    return this.refundRepository.listByPayment(payment.id);
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

  assertSameRefundPayload(refund, payloadHash) {
    if (!refund || refund.payloadHash !== payloadHash)
      throw new AppError(
        409,
        "REFUND_IDEMPOTENCY_KEY_CONFLICT",
        "Refund idempotency key was already used with a different payload",
      );
    const {
      payloadHash: _payloadHash,
      actorId: _actorId,
      ...publicRefund
    } = refund;
    return publicRefund;
  }
}
