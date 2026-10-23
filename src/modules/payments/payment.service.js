import { createHash } from "node:crypto";
import { AppError, ResourceNotFoundError } from "../../utils/errors.js";
import { PERMISSIONS } from "../../utils/access/permissions.js";
import { systemClock } from "../../utils/calendar.js";
import { createPendingPaymentSchema } from "./payment.schema.js";

function hashPayload({ invoiceId, amountCents, method, payerPersonId }) {
  return createHash("sha256")
    .update(JSON.stringify({ invoiceId, amountCents, method, payerPersonId }))
    .digest("hex");
}

function toPublicPayment(payment) {
  const { id, invoiceId, amountCents, method, status, reportedAt } = payment;
  return { id, invoiceId, amountCents, method, status, reportedAt };
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
