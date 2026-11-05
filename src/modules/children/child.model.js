import mongoose from "mongoose";
import { CHILD_LIMITS, CHILD_STATUS } from "./child.constants.js";

const guardianSchema = new mongoose.Schema(
  {
    personId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: "Person",
    },
    relationship: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: CHILD_LIMITS.MAX_RELATIONSHIP_LENGTH,
    },
  },
  { _id: false, strict: "throw" },
);

const relativeSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: CHILD_LIMITS.MAX_NAME_LENGTH,
    },
    relationship: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: CHILD_LIMITS.MAX_RELATIONSHIP_LENGTH,
    },
    contact: {
      type: String,
      trim: true,
      maxlength: CHILD_LIMITS.MAX_CONTACT_LENGTH,
    },
    note: { type: String, trim: true, maxlength: CHILD_LIMITS.MAX_NOTE_LENGTH },
  },
  { _id: false, strict: "throw" },
);

const foodDataSchema = new mongoose.Schema(
  {
    preferences: { type: [String], default: [] },
    exclusions: { type: [String], default: [] },
    allergyNotes: { type: [String], default: [] },
    note: { type: String, trim: true, maxlength: CHILD_LIMITS.MAX_NOTE_LENGTH },
  },
  { _id: false, strict: "throw" },
);

for (const path of ["preferences", "exclusions", "allergyNotes"]) {
  foodDataSchema.path(path).validate({
    validator: (items) =>
      items.length <= CHILD_LIMITS.MAX_FOOD_ITEMS &&
      items.every(
        (item) =>
          typeof item === "string" &&
          item.trim().length > 0 &&
          item.length <= CHILD_LIMITS.MAX_FOOD_ITEM_LENGTH,
      ),
    message: `Food list exceeds ${CHILD_LIMITS.MAX_FOOD_ITEMS} valid items`,
  });
}

const membershipSchema = new mongoose.Schema(
  {
    groupId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: "Group",
    },
    startedAt: { type: Date, required: true },
    endedAt: { type: Date },
  },
  { _id: false, strict: "throw" },
);

const childSchema = new mongoose.Schema(
  {
    firstName: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: CHILD_LIMITS.MAX_NAME_LENGTH,
    },
    lastName: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: CHILD_LIMITS.MAX_NAME_LENGTH,
    },
    middleName: {
      type: String,
      trim: true,
      minlength: 1,
      maxlength: CHILD_LIMITS.MAX_NAME_LENGTH,
    },
    dateOfBirth: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    status: {
      type: String,
      required: true,
      enum: Object.values(CHILD_STATUS),
      default: CHILD_STATUS.APPLICANT,
    },
    schoolYear: { type: String, match: /^\d{4}-\d{4}$/ },
    ageCategoryId: { type: mongoose.Schema.Types.ObjectId, ref: "Catalog" },
    groupId: { type: mongoose.Schema.Types.ObjectId, ref: "Group" },
    guardians: {
      type: [guardianSchema],
      default: [],
      validate: (items) => items.length <= CHILD_LIMITS.MAX_GUARDIANS,
    },
    relatives: {
      type: [relativeSchema],
      default: [],
      validate: (items) => items.length <= CHILD_LIMITS.MAX_RELATIVES,
    },
    food: { type: foodDataSchema, required: true, default: () => ({}) },
    benefitCode: { type: String, trim: true, minlength: 1, maxlength: 64 },
    enrolledAt: { type: Date },
    leftAt: { type: Date },
    billingStartMonth: { type: String, match: /^\d{4}-\d{2}$/ },
    firstUnbilledMonth: { type: String, match: /^\d{4}-\d{2}$/ },
    membershipHistory: {
      type: [membershipSchema],
      default: [],
      validate: (items) => items.length <= CHILD_LIMITS.MAX_MEMBERSHIP_HISTORY,
    },
  },
  { collection: "children", strict: "throw", bufferCommands: false },
);

childSchema.pre("validate", function validateStateFields() {
  const hasCurrentGroup = this.groupId !== undefined && this.groupId !== null;
  if (
    [CHILD_STATUS.ACTIVE, CHILD_STATUS.SUSPENDED].includes(this.status) &&
    !hasCurrentGroup
  ) {
    this.invalidate("groupId", "Active or suspended child requires groupId");
  }
  if (
    [CHILD_STATUS.APPLICANT, CHILD_STATUS.LEFT].includes(this.status) &&
    hasCurrentGroup
  ) {
    this.invalidate("groupId", "Applicant or left child cannot have groupId");
  }
});

childSchema.index({ lastName: 1, firstName: 1, dateOfBirth: 1 });

export const ChildModel = mongoose.model("Child", childSchema);
