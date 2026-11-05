import mongoose from "mongoose";
import { groupScopeFilter } from "./groupAccessPolicy.js";

// Технічні поля MongoDB не виходять за межі репозиторію.
function toGroup(document) {
  return {
    id: document._id.toString(),
    name: document.name,
    ageCategory: document.ageCategory,
    capacity: document.capacity,
    status: document.status,
  };
}

export class GroupRepository {
  constructor({ groupModel }) {
    this.groupModel = groupModel;
  }

  async findAll({ page, pageSize, scope }) {
    const skip = (page - 1) * pageSize;
    const filter = groupScopeFilter(scope);

    const [documents, total] = await Promise.all([
      this.groupModel
        .find(filter)
        .sort({ _id: 1 })
        .skip(skip)
        .limit(pageSize)
        .lean(),
      this.groupModel.countDocuments(filter),
    ]);
    return {
      groups: documents.map(toGroup),
      total,
    };
  }

  async findById(groupId, { scope } = {}) {
    // Некоректний ID, як і відсутній запис, повертає null замість CastError.
    if (!mongoose.isObjectIdOrHexString(groupId)) return null;
    const document = await this.groupModel
      .findOne({ $and: [{ _id: groupId }, groupScopeFilter(scope)] })
      .lean();
    return document ? toGroup(document) : null;
  }

  async insert(group) {
    const document = await this.groupModel.create(group);
    return toGroup(document);
  }

  async summarizeByAge({ scope } = {}) {
    return this.groupModel.aggregate([
      { $match: groupScopeFilter(scope) },
      {
        $group: {
          _id: "$ageCategory",
          groupsCount: { $sum: 1 },
          totalCapacity: { $sum: "$capacity" },
        },
      },
      {
        $project: {
          _id: 0,
          ageCategory: "$_id",
          groupsCount: 1,
          totalCapacity: 1,
        },
      },
      { $sort: { ageCategory: 1 } },
    ]);
  }

  async findActiveGroupIds({ personId, positions }) {
    if (!mongoose.isObjectIdOrHexString(personId) || positions.length === 0) {
      return [];
    }
    const clauses = [];
    if (positions.includes("educator")) clauses.push({ educatorId: personId });
    if (positions.includes("assistant"))
      clauses.push({ assistantId: personId });
    if (clauses.length === 0) return [];
    const documents = await this.groupModel
      .find({ $or: clauses, status: "ACTIVE" })
      .select({ _id: 1 })
      .lean();
    return documents.map(({ _id }) => _id.toString());
  }
}
