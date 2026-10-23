import mongoose from "mongoose";

function toPayment(document) {
  return {
    id: document._id.toString(),
    invoiceId: document.invoiceId.toString(),
    amountCents: document.amountCents,
    method: document.method,
    status: document.status,
    reportedAt: new Date(document.reportedAt),
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
}
