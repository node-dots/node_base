export class FinanceReportRepository {
  constructor({ invoiceModel, paymentModel, refundModel, expenseModel }) {
    Object.assign(this, {
      invoiceModel,
      paymentModel,
      refundModel,
      expenseModel,
    });
  }
  async accruedIncome(month) {
    const [row] = await this.invoiceModel.aggregate([
      { $unwind: "$parts" },
      { $match: { "parts.month": month, "parts.cancelled": { $ne: true } } },
      { $group: { _id: null, total: { $sum: "$parts.amountCents" } } },
    ]);
    return row?.total ?? 0;
  }
  async receipts(start, end) {
    const [row] = await this.paymentModel.aggregate([
      {
        $match: { status: "CONFIRMED", occurredAt: { $gte: start, $lt: end } },
      },
      { $group: { _id: null, total: { $sum: "$amountCents" } } },
    ]);
    return row?.total ?? 0;
  }
  async refunds(start, end) {
    const [row] = await this.refundModel.aggregate([
      {
        $match: { status: "CONFIRMED", recordedAt: { $gte: start, $lt: end } },
      },
      { $group: { _id: null, total: { $sum: "$amountCents" } } },
    ]);
    return row?.total ?? 0;
  }
  async approvedExpenseBreakdown(month) {
    const [row] = await this.expenseModel.aggregate([
      { $match: { status: "APPROVED", serviceMonth: month } },
      {
        $addFields: {
          signedAmount: {
            $cond: [
              { $eq: ["$correctionDirection", "DECREASE"] },
              { $multiply: ["$amountCents", -1] },
              "$amountCents",
            ],
          },
        },
      },
      {
        $group: {
          _id: "$category",
          total: { $sum: "$signedAmount" },
          rows: { $sum: 1 },
        },
      },
      {
        $group: {
          _id: null,
          total: { $sum: "$total" },
          categories: {
            $push: { category: "$_id", amountCents: "$total", rows: "$rows" },
          },
          rows: { $sum: "$rows" },
        },
      },
    ]);
    return {
      totalCents: row?.total ?? 0,
      rows: row?.rows ?? 0,
      categories: row?.categories ?? [],
    };
  }
  async paidExpenses(month) {
    const [row] = await this.expenseModel.aggregate([
      {
        $match: {
          paymentDate: { $regex: `^${month}-` },
          paidAt: { $exists: true },
        },
      },
      { $group: { _id: null, total: { $sum: "$amountCents" } } },
    ]);
    return row?.total ?? 0;
  }
  async unapprovedSalaryCount(month) {
    return this.expenseModel.countDocuments({
      category: "SALARY",
      serviceMonth: month,
      status: "DRAFT",
    });
  }
  async lateConfirmations(start, end) {
    return this.paymentModel.countDocuments({
      status: "CONFIRMED",
      occurredAt: { $gte: start, $lt: end },
      confirmedAt: { $gte: end },
    });
  }
}
