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
    ...(document.schoolYear ? { schoolYear: document.schoolYear } : {}),
    ...(document.ageCategoryId
      ? { ageCategoryId: document.ageCategoryId.toString() }
      : {}),
    ...(document.roomId ? { roomId: document.roomId.toString() } : {}),
    ...(document.educatorId
      ? { educatorId: document.educatorId.toString() }
      : {}),
    ...(document.assistantId
      ? { assistantId: document.assistantId.toString() }
      : {}),
    occupiedSeats: document.occupiedSeats ?? 0,
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

  async insert(group, { session } = {}) {
    const [document] = await this.groupModel.create([group], { session });
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

  async findActiveEmployeeAssignments(personId, { session } = {}) {
    if (!mongoose.isObjectIdOrHexString(personId)) return [];
    let query = this.groupModel
      .find({
        status: "ACTIVE",
        $or: [{ educatorId: personId }, { assistantId: personId }],
      })
      .select({ _id: 1 })
      .lean();
    if (session) query = query.session(session);
    return query;
  }

  async findByIdForUpdate(groupId, { session } = {}) {
    if (!mongoose.isObjectIdOrHexString(groupId)) return null;
    let query = this.groupModel.findById(groupId);
    if (session) query = query.session(session);
    const document = await query.lean();
    return document ? toGroup(document) : null;
  }

  async findActiveResourceConflicts({
    schoolYear,
    roomId,
    educatorId,
    assistantId,
    excludeGroupId,
    session,
  }) {
    const resources = [];
    if (roomId) resources.push({ roomId: new mongoose.Types.ObjectId(roomId) });
    const employeeIds = [educatorId, assistantId]
      .filter(Boolean)
      .map((id) => new mongoose.Types.ObjectId(id));
    if (employeeIds.length) {
      resources.push({ educatorId: { $in: employeeIds } });
      resources.push({ assistantId: { $in: employeeIds } });
    }
    const filter = { schoolYear, status: "ACTIVE", $or: resources };
    if (excludeGroupId)
      filter._id = { $ne: new mongoose.Types.ObjectId(excludeGroupId) };
    let query = this.groupModel
      .find(filter)
      .select({ _id: 1, roomId: 1, educatorId: 1, assistantId: 1 })
      .lean();
    if (session) query = query.session(session);
    return query;
  }

  async updateById(groupId, update, { session } = {}) {
    if (!mongoose.isObjectIdOrHexString(groupId)) return null;
    const document = await this.groupModel
      .findByIdAndUpdate(
        groupId,
        { $set: update },
        { new: true, runValidators: true, session },
      )
      .lean();
    return document ? toGroup(document) : null;
  }
}
