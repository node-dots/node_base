import mongoose from "mongoose";
import { childScopeFilter } from "./childAccessPolicy.js";

function cloneNested(value) {
  return value === undefined ? undefined : structuredClone(value);
}

const PROFILE_FIELDS = new Set([
  "firstName",
  "lastName",
  "middleName",
  "dateOfBirth",
  "guardians",
  "relatives",
  "food",
  "benefitCode",
]);

function toChild(document) {
  const child = {
    id: document._id.toString(),
    firstName: document.firstName,
    lastName: document.lastName,
    middleName: document.middleName,
    dateOfBirth: document.dateOfBirth,
    status: document.status,
    guardians: (document.guardians ?? []).map(({ personId, relationship }) => ({
      personId: personId.toString(),
      relationship,
    })),
    relatives: cloneNested(document.relatives) ?? [],
    food: cloneNested(document.food) ?? {},
    membershipHistory: (document.membershipHistory ?? []).map(
      ({ groupId, startedAt, endedAt }) => ({
        groupId: groupId.toString(),
        startedAt: new Date(startedAt),
        ...(endedAt ? { endedAt: new Date(endedAt) } : {}),
      }),
    ),
  };

  for (const field of [
    "schoolYear",
    "benefitCode",
    "billingStartMonth",
    "firstUnbilledMonth",
  ]) {
    if (document[field] !== undefined) child[field] = document[field];
  }
  for (const field of ["ageCategoryId", "groupId"]) {
    if (document[field]) child[field] = document[field].toString();
  }
  for (const field of ["enrolledAt", "leftAt"]) {
    if (document[field]) child[field] = new Date(document[field]);
  }
  return child;
}

export class ChildRepository {
  constructor({ childModel }) {
    this.childModel = childModel;
  }

  async insertApplicant(applicant, { session } = {}) {
    const [document] = await this.childModel.create([applicant], { session });
    return toChild(document.toObject());
  }

  async findById(childId) {
    if (!mongoose.isObjectIdOrHexString(childId)) return null;
    const document = await this.childModel.findById(childId).lean();
    return document ? toChild(document) : null;
  }

  async findByIdInScope(childId, scope) {
    if (!mongoose.isObjectIdOrHexString(childId)) return null;
    const document = await this.childModel
      .findOne({
        $and: [
          { _id: new mongoose.Types.ObjectId(childId) },
          childScopeFilter(scope),
        ],
      })
      .lean();
    return document ? toChild(document) : null;
  }

  async findPageInScope({ scope, page, pageSize, filter = {} }) {
    const accessFilter = childScopeFilter(scope);
    const combinedFilter = { $and: [accessFilter, filter] };
    const skip = (page - 1) * pageSize;
    const [documents, total] = await Promise.all([
      this.childModel
        .find(combinedFilter)
        .sort({ _id: 1 })
        .skip(skip)
        .limit(pageSize)
        .lean(),
      this.childModel.countDocuments(combinedFilter),
    ]);
    return { children: documents.map(toChild), total };
  }

  async aggregateInScope(scope, pipeline = []) {
    if (!Array.isArray(pipeline) || pipeline.some((stage) => stage.$match)) {
      throw new TypeError("Потрібен pipeline без клієнтського $match");
    }
    return this.childModel.aggregate([
      { $match: childScopeFilter(scope) },
      ...pipeline,
    ]);
  }

  async findActiveGroupIdsForGuardian(personId) {
    if (!mongoose.isObjectIdOrHexString(personId)) return [];
    const documents = await this.childModel
      .find({
        "guardians.personId": new mongoose.Types.ObjectId(personId),
        groupId: { $exists: true },
        status: "ACTIVE",
      })
      .select({ groupId: 1 })
      .lean();
    return [...new Set(documents.map(({ groupId }) => groupId.toString()))];
  }

  async findActiveGroupIds(personId) {
    return this.findActiveGroupIdsForGuardian(personId);
  }

  async countOccupiedByGroup(groupId, { session } = {}) {
    if (!mongoose.isObjectIdOrHexString(groupId)) return 0;
    let query = this.childModel.countDocuments({
      groupId: new mongoose.Types.ObjectId(groupId),
      status: { $in: ["ACTIVE", "SUSPENDED"] },
    });
    if (session) query = query.session(session);
    return query;
  }

  async updateProfileById(childId, profileUpdate, { session } = {}) {
    if (!mongoose.isObjectIdOrHexString(childId)) return null;
    const fields = Object.keys(profileUpdate);
    if (
      fields.length === 0 ||
      fields.some((field) => !PROFILE_FIELDS.has(field))
    ) {
      throw new TypeError("Only child profile fields can be updated here");
    }
    const document = await this.childModel.findByIdAndUpdate(
      childId,
      { $set: profileUpdate },
      { returnDocument: "after", runValidators: true, session },
    );
    return document ? toChild(document.toObject()) : null;
  }

  async updateProfileByIdInScope(
    childId,
    profileUpdate,
    scope,
    { session } = {},
  ) {
    if (!mongoose.isObjectIdOrHexString(childId)) return null;
    const fields = Object.keys(profileUpdate);
    if (
      fields.length === 0 ||
      fields.some((field) => !PROFILE_FIELDS.has(field))
    ) {
      throw new TypeError("Only child profile fields can be updated here");
    }
    const document = await this.childModel.findOneAndUpdate(
      {
        $and: [
          { _id: new mongoose.Types.ObjectId(childId) },
          childScopeFilter(scope),
        ],
      },
      { $set: profileUpdate },
      { returnDocument: "after", runValidators: true, session },
    );
    return document ? toChild(document.toObject()) : null;
  }
}
