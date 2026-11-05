import mongoose from "mongoose";

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

  async insertApplicant(applicant) {
    const document = await this.childModel.create(applicant);
    return toChild(document.toObject());
  }

  async findById(childId) {
    if (!mongoose.isObjectIdOrHexString(childId)) return null;
    const document = await this.childModel.findById(childId).lean();
    return document ? toChild(document) : null;
  }

  async updateProfileById(childId, profileUpdate) {
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
      { returnDocument: "after", runValidators: true },
    );
    return document ? toChild(document.toObject()) : null;
  }
}
