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
    "billingEndMonth",
    "firstUnbilledMonth",
  ]) {
    if (document[field] !== undefined) child[field] = document[field];
  }
  child.benefitAssignments = cloneNested(document.benefitAssignments) ?? [];
  for (const field of ["ageCategoryId", "groupId"]) {
    if (document[field]) child[field] = document[field].toString();
  }
  for (const field of ["enrolledAt", "leftAt"]) {
    if (document[field]) child[field] = new Date(document[field]);
  }
  if (document.withdrawalSummary) {
    child.withdrawalSummary = {
      withdrawnAt: new Date(document.withdrawalSummary.withdrawnAt),
      billingEndMonth: document.withdrawalSummary.billingEndMonth,
      obligationCents: document.withdrawalSummary.obligationCents,
      refundDueCents: document.withdrawalSummary.refundDueCents,
    };
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

  async findByIdForUpdate(childId, { session } = {}) {
    if (!mongoose.isObjectIdOrHexString(childId)) return null;
    let query = this.childModel.findById(childId);
    if (session) query = query.session(session);
    const document = await query.lean();
    return document ? toChild(document) : null;
  }

  async updateMembershipById(childId, membershipUpdate, { session } = {}) {
    if (!mongoose.isObjectIdOrHexString(childId)) return null;
    const fields = new Set([
      "status",
      "schoolYear",
      "ageCategoryId",
      "groupId",
      "enrolledAt",
      "leftAt",
      "billingStartMonth",
      "billingEndMonth",
      "firstUnbilledMonth",
      "membershipHistory",
      "withdrawalSummary",
    ]);
    if (
      !membershipUpdate ||
      Object.keys(membershipUpdate).length === 0 ||
      Object.keys(membershipUpdate).some((field) => !fields.has(field))
    ) {
      throw new TypeError("Only child membership fields can be updated here");
    }
    const document = await this.childModel
      .findByIdAndUpdate(
        childId,
        { $set: membershipUpdate },
        { new: true, runValidators: true, session },
      )
      .lean();
    return document ? toChild(document) : null;
  }

  async updateBenefitAssignmentsById(
    childId,
    benefitAssignments,
    { session } = {},
  ) {
    if (!mongoose.isObjectIdOrHexString(childId)) return null;
    const document = await this.childModel
      .findByIdAndUpdate(
        childId,
        { $set: { benefitAssignments } },
        { new: true, runValidators: true, session },
      )
      .lean();
    return document ? toChild(document) : null;
  }

  async decrementWithdrawalRefundDue(childId, amountCents, { session } = {}) {
    if (!mongoose.isObjectIdOrHexString(childId)) return null;
    const document = await this.childModel
      .findOneAndUpdate(
        {
          _id: childId,
          status: "LEFT",
          "withdrawalSummary.refundDueCents": { $gte: amountCents },
        },
        { $inc: { "withdrawalSummary.refundDueCents": -amountCents } },
        { new: true, runValidators: true, session },
      )
      .lean();
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

  async countOccupiedByGroups(groupIds, { session } = {}) {
    const ids = groupIds
      .filter(mongoose.isObjectIdOrHexString)
      .map((id) => new mongoose.Types.ObjectId(id));
    if (!ids.length) return new Map();
    let query = this.childModel.aggregate([
      {
        $match: {
          groupId: { $in: ids },
          status: { $in: ["ACTIVE", "SUSPENDED"] },
        },
      },
      { $group: { _id: "$groupId", count: { $sum: 1 } } },
    ]);
    if (session) query = query.session(session);
    return new Map(
      (await query).map(({ _id, count }) => [_id.toString(), count]),
    );
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
