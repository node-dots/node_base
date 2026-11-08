import mongoose from "mongoose";

function dto(d) {
  return {
    id: d._id.toString(),
    category: d.category,
    amountCents: d.amountCents,
    serviceMonth: d.serviceMonth,
    reason: d.reason,
    status: d.status,
    ...(d.paymentDate ? { paymentDate: d.paymentDate } : {}),
    ...(d.paidAt ? { paidAt: new Date(d.paidAt) } : {}),
    ...(d.sourceKey ? { sourceKey: d.sourceKey } : {}),
    ...(d.correctionOf
      ? {
          correctionOf: d.correctionOf.toString(),
          correctionDirection: d.correctionDirection,
        }
      : {}),
  };
}

export class ExpenseRepository {
  constructor({ expenseModel }) {
    this.expenseModel = expenseModel;
  }
  async insert(value, { session } = {}) {
    const [doc] = await this.expenseModel.create([value], { session });
    return dto(doc.toObject());
  }
  async findById(id, { session } = {}) {
    if (!mongoose.isObjectIdOrHexString(id)) return null;
    let query = this.expenseModel.findById(id);
    if (session) query = query.session(session);
    const doc = await query.lean();
    return doc ? dto(doc) : null;
  }
  async findBySourceKey(sourceKey, { session } = {}) {
    let query = this.expenseModel.findOne({ sourceKey });
    if (session) query = query.session(session);
    const doc = await query.lean();
    return doc ? dto(doc) : null;
  }
  async #transition(id, filter, update, { session } = {}) {
    const doc = await this.expenseModel
      .findOneAndUpdate({ _id: id, ...filter }, update, {
        new: true,
        runValidators: true,
        session,
      })
      .lean();
    return doc ? dto(doc) : null;
  }
  approve(id, options) {
    return this.#transition(
      id,
      { status: "DRAFT" },
      { $set: { status: "APPROVED" } },
      options,
    );
  }
  pay(id, paymentDate, paidAt, options) {
    return this.#transition(
      id,
      { status: "APPROVED", paidAt: { $exists: false } },
      { $set: { paymentDate, paidAt } },
      options,
    );
  }
  cancel(id, options) {
    return this.#transition(
      id,
      { status: "DRAFT" },
      { $set: { status: "CANCELLED" } },
      options,
    );
  }
  async sumApproved(serviceMonth, { session } = {}) {
    let query = this.expenseModel.aggregate([
      { $match: { serviceMonth, status: "APPROVED" } },
      {
        $addFields: {
          signedAmountCents: {
            $cond: [
              { $eq: ["$correctionDirection", "DECREASE"] },
              { $multiply: ["$amountCents", -1] },
              "$amountCents",
            ],
          },
        },
      },
      { $group: { _id: null, totalCents: { $sum: "$signedAmountCents" } } },
    ]);
    if (session) query = query.session(session);
    return (await query)[0]?.totalCents ?? 0;
  }
  async netApproved(id, { session } = {}) {
    if (!mongoose.isObjectIdOrHexString(id)) return 0;
    const objectId = new mongoose.Types.ObjectId(id);
    let query = this.expenseModel.aggregate([
      {
        $match: {
          status: "APPROVED",
          $or: [{ _id: objectId }, { correctionOf: objectId }],
        },
      },
      {
        $addFields: {
          signedAmountCents: {
            $cond: [
              { $eq: ["$correctionDirection", "DECREASE"] },
              { $multiply: ["$amountCents", -1] },
              "$amountCents",
            ],
          },
        },
      },
      { $group: { _id: null, total: { $sum: "$signedAmountCents" } } },
    ]);
    if (session) query = query.session(session);
    return (await query)[0]?.total ?? 0;
  }
  async sumCashFlow(paymentMonth, { session } = {}) {
    let query = this.expenseModel.aggregate([
      {
        $match: {
          paymentDate: { $regex: `^${paymentMonth}-` },
          paidAt: { $exists: true },
        },
      },
      { $group: { _id: null, totalCents: { $sum: "$amountCents" } } },
    ]);
    if (session) query = query.session(session);
    return (await query)[0]?.totalCents ?? 0;
  }
}
