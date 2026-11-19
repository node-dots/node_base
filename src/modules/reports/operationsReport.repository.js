import mongoose from "mongoose";

export class OperationsReportRepository {
  constructor({ childModel, scheduleModel, expenseModel }) {
    Object.assign(this, { childModel, scheduleModel, expenseModel });
  }
  async benefitDistribution(month) {
    return this.childModel.aggregate([
      { $match: { status: { $in: ["ACTIVE", "SUSPENDED"] } } },
      {
        $addFields: {
          currentBenefit: {
            $arrayElemAt: [
              {
                $filter: {
                  input: { $ifNull: ["$benefitAssignments", []] },
                  as: "benefit",
                  cond: {
                    $and: [
                      { $lte: ["$$benefit.startMonth", month] },
                      {
                        $or: [
                          {
                            $eq: [
                              { $ifNull: ["$$benefit.endMonth", null] },
                              null,
                            ],
                          },
                          { $gte: ["$$benefit.endMonth", month] },
                        ],
                      },
                    ],
                  },
                },
              },
              0,
            ],
          },
        },
      },
      {
        $group: {
          _id: { $ifNull: ["$currentBenefit.benefitCode", "NONE"] },
          basisPoints: {
            $first: { $ifNull: ["$currentBenefit.basisPoints", 0] },
          },
          childrenCount: { $sum: 1 },
        },
      },
      {
        $project: {
          _id: 0,
          benefitCode: "$_id",
          basisPoints: 1,
          childrenCount: 1,
        },
      },
      { $sort: { benefitCode: 1 } },
    ]);
  }
  async publishedTeacherLoad(weekStart, teacherId) {
    const match = { weekStart, published: { $exists: true } };
    if (teacherId)
      match["published.slots.teacherId"] = new mongoose.Types.ObjectId(
        teacherId,
      );
    return this.scheduleModel.aggregate([
      { $match: match },
      { $unwind: "$published.slots" },
      ...(teacherId
        ? [
            {
              $match: {
                "published.slots.teacherId": new mongoose.Types.ObjectId(
                  teacherId,
                ),
              },
            },
          ]
        : []),
      {
        $group: {
          _id: "$published.slots.teacherId",
          slotsCount: { $sum: 1 },
          groupIds: { $addToSet: "$published.slots.groupId" },
          subjects: { $addToSet: "$published.slots.subjectCode" },
        },
      },
      {
        $project: {
          _id: 0,
          teacherId: { $toString: "$_id" },
          slotsCount: 1,
          groupsCount: { $size: "$groupIds" },
          subjects: 1,
        },
      },
      { $sort: { teacherId: 1 } },
    ]);
  }
  async approvedExpenseCategories(month) {
    const [result] = await this.expenseModel.aggregate([
      { $match: { serviceMonth: month, status: "APPROVED" } },
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
          amountCents: { $sum: "$signedAmount" },
          entriesCount: { $sum: 1 },
        },
      },
      {
        $group: {
          _id: null,
          categories: {
            $push: {
              category: "$_id",
              amountCents: "$amountCents",
              entriesCount: "$entriesCount",
            },
          },
          totalCents: { $sum: "$amountCents" },
        },
      },
    ]);
    const categories = new Map(
      (result?.categories ?? []).map((row) => [row.category, row]),
    );
    return {
      totalCents: result?.totalCents ?? 0,
      categories: ["RENT", "SALARY", "FOOD", "OTHER"].map(
        (category) =>
          categories.get(category) ?? {
            category,
            amountCents: 0,
            entriesCount: 0,
          },
      ),
    };
  }
}
