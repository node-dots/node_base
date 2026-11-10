import mongoose from "mongoose";

function toInvoice(document) {
  return {
    id: document._id.toString(),
    childId: document.childId.toString(),
    service: document.service,
    serviceMonth: document.serviceMonth,
    billingType: document.billingType ?? "MONTHLY",
    status: document.status,
    origAmountCents: document.origAmountCents,
    remainingAmountCents: document.remainingAmountCents,
    paidAmountCents: document.paidAmountCents ?? 0,
    refundableAmountCents: document.refundableAmountCents ?? 0,
    refundedAmountCents: document.refundedAmountCents ?? 0,
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

  async findTuitionCoveringMonth(childId, serviceMonth, { session } = {}) {
    if (!mongoose.isObjectIdOrHexString(childId)) return null;
    let query = this.invoiceModel.findOne({
      childId,
      service: "TUITION",
      status: { $ne: "CANCELLED" },
      $or: [
        { reservedMonths: serviceMonth },
        { reservedMonths: { $exists: false }, "parts.month": serviceMonth },
      ],
    });
    if (session) query = query.session(session);
    const document = await query.lean();
    return document ? toInvoice(document) : null;
  }

  async cancelExpiredAnnual(childId, currentMonth, { session } = {}) {
    if (!mongoose.isObjectIdOrHexString(childId)) return null;
    const document = await this.invoiceModel
      .findOneAndUpdate(
        {
          childId,
          service: "TUITION",
          billingType: "ANNUAL",
          serviceMonth: { $lt: currentMonth },
          status: "OPEN",
          paidAmountCents: 0,
          $expr: { $eq: ["$remainingAmountCents", "$origAmountCents"] },
        },
        {
          $set: {
            status: "CANCELLED",
            remainingAmountCents: 0,
            "parts.$[].remainingCents": 0,
            "parts.$[].cancelled": true,
            reservedMonths: [],
          },
        },
        { new: true, runValidators: true, session },
      )
      .lean();
    return document ? toInvoice(document) : null;
  }

  async cancelAfterBillingEnd(
    childId,
    billingEndMonth,
    withdrawnAt,
    { session } = {},
  ) {
    if (!mongoose.isObjectIdOrHexString(childId))
      throw new TypeError("childId must be a MongoDB ObjectId");
    const documents = await this.invoiceModel
      .find({ childId })
      .session(session ?? null)
      .lean();
    let obligationCents = 0;
    let paidAmountCents = 0;
    let cancelledParts = 0;
    const cancelledInvoiceIds = [];
    for (const document of documents) {
      const invoice = toInvoice(document);
      paidAmountCents += invoice.paidAmountCents;
      let invoiceObligationCents = 0;
      const parts = invoice.parts.map((part) => {
        if (part.month < billingEndMonth && !part.cancelled) {
          obligationCents += part.amountCents;
          invoiceObligationCents += part.amountCents;
        }
        if (part.month >= billingEndMonth && !part.cancelled) {
          cancelledParts += 1;
          return {
            ...part,
            remainingCents: 0,
            cancelled: true,
            cancelledAt: withdrawnAt,
          };
        }
        return part;
      });
      const changed = parts.some(
        (part, index) => part !== invoice.parts[index],
      );
      const refundableAmountCents = Math.max(
        0,
        invoice.paidAmountCents - invoiceObligationCents,
      );
      if (
        !changed &&
        (document.refundableAmountCents ?? 0) === refundableAmountCents
      )
        continue;
      const allCancelled = parts.every(({ cancelled }) => cancelled);
      const remainingAmountCents = parts.reduce(
        (sum, part) => sum + part.remainingCents,
        0,
      );
      await this.invoiceModel.updateOne(
        { _id: document._id, status: document.status },
        {
          $set: {
            parts,
            reservedMonths: parts
              .filter(({ cancelled }) => !cancelled)
              .map(({ month }) => month),
            remainingAmountCents,
            refundableAmountCents,
            ...(allCancelled ? { status: "CANCELLED" } : {}),
          },
        },
        { runValidators: true, session },
      );
      cancelledInvoiceIds.push(invoice.id);
    }
    return {
      billingEndMonth,
      obligationCents,
      paidAmountCents,
      refundDueCents: Math.max(0, paidAmountCents - obligationCents),
      cancelledInvoiceIds,
      cancelledParts,
    };
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
    const current = await this.findById(invoiceId, { session });
    if (!current) return null;
    const isAnnual = current.billingType === "ANNUAL";
    const document = await this.invoiceModel
      .findOneAndUpdate(
        {
          _id: invoiceId,
          status: { $in: ["OPEN", "PARTIAL"] },
          ...(isAnnual
            ? { remainingAmountCents: amountCents }
            : {
                remainingAmountCents: { $gte: amountCents },
                "parts.0.remainingCents": { $gte: amountCents },
              }),
        },
        {
          $inc: {
            paidAmountCents: amountCents,
            remainingAmountCents: -amountCents,
            ...(isAnnual ? {} : { "parts.0.remainingCents": -amountCents }),
          },
          $set: {
            status: "PARTIAL",
            ...(isAnnual ? { "parts.$[].remainingCents": 0 } : {}),
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

  async reserveRefund(invoiceId, amountCents, { session } = {}) {
    if (!mongoose.isObjectIdOrHexString(invoiceId)) return null;
    const document = await this.invoiceModel
      .findOneAndUpdate(
        { _id: invoiceId, refundableAmountCents: { $gte: amountCents } },
        {
          $inc: {
            refundableAmountCents: -amountCents,
            refundedAmountCents: amountCents,
          },
        },
        { new: true, runValidators: true, session },
      )
      .lean();
    return document ? toInvoice(document) : null;
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

  async findPageForMonth({ month, page, pageSize }) {
    const filter = {
      $or: [{ serviceMonth: month }, { "parts.month": month }],
    };
    const [documents, total] = await Promise.all([
      this.invoiceModel
        .find(filter)
        .sort({ serviceMonth: -1, service: 1, _id: 1 })
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .lean(),
      this.invoiceModel.countDocuments(filter),
    ]);
    return { invoices: documents.map(toInvoice), total };
  }

  async aggregateCurrentBalances({ asOf, guardianId } = {}) {
    const pipeline = [];
    if (guardianId) {
      pipeline.push(
        {
          $lookup: {
            from: "children",
            let: { childId: "$childId" },
            pipeline: [
              {
                $match: {
                  $expr: { $eq: ["$_id", "$$childId"] },
                  "guardians.personId": new mongoose.Types.ObjectId(guardianId),
                },
              },
              { $project: { _id: 1 } },
            ],
            as: "visibleChild",
          },
        },
        { $match: { "visibleChild.0": { $exists: true } } },
      );
    }
    pipeline.push(
      { $unwind: "$parts" },
      {
        $group: {
          _id: "$_id",
          outstandingCents: {
            $sum: {
              $cond: [
                { $eq: ["$parts.cancelled", true] },
                0,
                "$parts.remainingCents",
              ],
            },
          },
          overdueCents: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $ne: ["$parts.cancelled", true] },
                    { $lt: ["$dueAt", asOf] },
                  ],
                },
                "$parts.remainingCents",
                0,
              ],
            },
          },
          refundDueCents: {
            $first: { $ifNull: ["$refundableAmountCents", 0] },
          },
        },
      },
      {
        $group: {
          _id: null,
          currentOutstandingCents: { $sum: "$outstandingCents" },
          currentOverdueCents: { $sum: "$overdueCents" },
          currentRefundDueCents: { $sum: "$refundDueCents" },
        },
      },
      {
        $project: {
          _id: 0,
          currentOutstandingCents: 1,
          currentOverdueCents: 1,
          currentRefundDueCents: 1,
        },
      },
    );
    const [totals] = await this.invoiceModel.aggregate(pipeline);
    return (
      totals ?? {
        currentOutstandingCents: 0,
        currentOverdueCents: 0,
        currentRefundDueCents: 0,
      }
    );
  }
}
