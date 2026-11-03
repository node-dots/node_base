import mongoose from "mongoose";

function toPayment(document) {
  return {
    id: document._id.toString(),
    invoiceId: document.invoiceId.toString(),
    amountCents: document.amountCents,
    method: document.method,
    status: document.status,
    reportedAt: new Date(document.reportedAt),
    ...(document.occurredAt
      ? { occurredAt: new Date(document.occurredAt) }
      : {}),
    ...(document.confirmedAt
      ? { confirmedAt: new Date(document.confirmedAt) }
      : {}),
    ...(document.rejectedAt
      ? { rejectedAt: new Date(document.rejectedAt) }
      : {}),
    ...(document.reviewedById
      ? { reviewedById: document.reviewedById.toString() }
      : {}),
  };
}

export class PaymentRepository {
  constructor({ paymentModel }) {
    this.paymentModel = paymentModel;
  }

  async findByIdempotency({ actorId, idempotencyKey }, { session } = {}) {
    if (!mongoose.isObjectIdOrHexString(actorId)) return null;
    let query = this.paymentModel.findOne({ actorId, idempotencyKey });
    if (session) query = query.session(session);
    const document = await query.lean();
    return document
      ? {
          ...toPayment(document),
          payerPersonId: document.payerPersonId.toString(),
          actorId: document.actorId.toString(),
          payloadHash: document.payloadHash,
        }
      : null;
  }

  async insert(payment, { session } = {}) {
    const [document] = await this.paymentModel.create([payment], { session });
    return toPayment(document.toObject());
  }

  async findById(paymentId, { session } = {}) {
    if (!mongoose.isObjectIdOrHexString(paymentId)) return null;
    let query = this.paymentModel.findById(paymentId);
    if (session) query = query.session(session);
    const document = await query.lean();
    return document
      ? {
          ...toPayment(document),
          payerPersonId: document.payerPersonId.toString(),
          actorId: document.actorId.toString(),
        }
      : null;
  }

  async confirmPending(
    paymentId,
    { occurredAt, confirmedAt, reviewedById },
    { session } = {},
  ) {
    const document = await this.paymentModel
      .findOneAndUpdate(
        { _id: paymentId, status: "PENDING" },
        {
          $set: {
            status: "CONFIRMED",
            occurredAt,
            confirmedAt,
            reviewedById,
          },
        },
        { new: true, runValidators: true, session },
      )
      .lean();
    return document ? toPayment(document) : null;
  }

  async rejectPending(
    paymentId,
    { rejectedAt, reviewedById },
    { session } = {},
  ) {
    const document = await this.paymentModel
      .findOneAndUpdate(
        { _id: paymentId, status: "PENDING" },
        { $set: { status: "REJECTED", rejectedAt, reviewedById } },
        { new: true, runValidators: true, session },
      )
      .lean();
    return document ? toPayment(document) : null;
  }
}
