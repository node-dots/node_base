import mongoose from "mongoose";

function toRefund(document) {
  return {
    id: document._id.toString(),
    paymentId: document.paymentId.toString(),
    invoiceId: document.invoiceId.toString(),
    childId: document.childId.toString(),
    amountCents: document.amountCents,
    reason: document.reason,
    status: document.status,
    recordedAt: new Date(document.recordedAt),
  };
}

export class RefundRepository {
  constructor({ refundModel }) {
    if (!refundModel) throw new TypeError("refundModel is required");
    this.refundModel = refundModel;
  }

  async findByIdempotency({ actorId, idempotencyKey }, { session } = {}) {
    if (!mongoose.isObjectIdOrHexString(actorId)) return null;
    let query = this.refundModel.findOne({ actorId, idempotencyKey });
    if (session) query = query.session(session);
    const document = await query.lean();
    return document
      ? {
          ...toRefund(document),
          actorId: document.actorId.toString(),
          payloadHash: document.payloadHash,
        }
      : null;
  }

  async insert(refund, { session } = {}) {
    const [document] = await this.refundModel.create([refund], { session });
    return toRefund(document.toObject());
  }

  async listByPayment(paymentId, { session } = {}) {
    if (!mongoose.isObjectIdOrHexString(paymentId)) return [];
    let query = this.refundModel
      .find({ paymentId })
      .sort({ recordedAt: -1, _id: 1 });
    if (session) query = query.session(session);
    return (await query.lean()).map(toRefund);
  }
}
