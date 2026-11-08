import mongoose from "mongoose";

function toInvoice(document) {
  return {
    id: document._id.toString(),
    childId: document.childId.toString(),
    service: document.service,
    serviceMonth: document.serviceMonth,
    status: document.status,
    origAmountCents: document.origAmountCents,
    remainingAmountCents: document.remainingAmountCents,
    paidAmountCents: document.paidAmountCents ?? 0,
    tariffSnapshot: structuredClone(document.tariffSnapshot),
    ...(document.benefitSnapshot
      ? { benefitSnapshot: structuredClone(document.benefitSnapshot) }
      : {}),
    formula: document.formula,
    dueAt: new Date(document.dueAt),
    parts: structuredClone(document.parts),
  };
}

export class InvoiceRepository {
  constructor({ invoiceModel }) {
    this.invoiceModel = invoiceModel;
  }

  async insert(invoice, { session } = {}) {
    const [document] = await this.invoiceModel.create([invoice], { session });
    return toInvoice(document.toObject());
  }

  async findByUnique({ childId, service, serviceMonth }, { session } = {}) {
    if (!mongoose.isObjectIdOrHexString(childId)) return null;
    let query = this.invoiceModel.findOne({ childId, service, serviceMonth });
    if (session) query = query.session(session);
    const document = await query.lean();
    return document ? toInvoice(document) : null;
  }

  async findById(invoiceId, { session } = {}) {
    if (!mongoose.isObjectIdOrHexString(invoiceId)) return null;
    let query = this.invoiceModel.findById(invoiceId);
    if (session) query = query.session(session);
    const document = await query.lean();
    return document ? toInvoice(document) : null;
  }

  async applyReceipt(invoiceId, amountCents, { session } = {}) {
    if (!mongoose.isObjectIdOrHexString(invoiceId)) return null;
    const document = await this.invoiceModel
      .findOneAndUpdate(
        {
          _id: invoiceId,
          status: { $in: ["OPEN", "PARTIAL"] },
          remainingAmountCents: { $gte: amountCents },
          "parts.0.remainingCents": { $gte: amountCents },
        },
        {
          $inc: {
            paidAmountCents: amountCents,
            remainingAmountCents: -amountCents,
            "parts.0.remainingCents": -amountCents,
          },
          $set: {
            status: "PARTIAL",
          },
        },
        { new: true, runValidators: true, session },
      )
      .lean();
    if (!document) return null;
    if (document.remainingAmountCents === 0) {
      const paid = await this.invoiceModel
        .findOneAndUpdate(
          { _id: invoiceId, status: "PARTIAL", remainingAmountCents: 0 },
          { $set: { status: "PAID" } },
          { new: true, runValidators: true, session },
        )
        .lean();
      return paid ? toInvoice(paid) : toInvoice(document);
    }
    return toInvoice(document);
  }

  async listByChild(childId) {
    if (!mongoose.isObjectIdOrHexString(childId)) return [];
    return (
      await this.invoiceModel
        .find({ childId })
        .sort({ serviceMonth: -1, service: 1, _id: 1 })
        .lean()
    ).map(toInvoice);
  }
}
