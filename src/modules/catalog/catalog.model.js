import mongoose from "mongoose";
import {
  CATALOG_KIND,
  CATALOG_LIMITS,
  ROOM_TYPE,
} from "./catalog.constants.js";

function validateKindFields() {
  const hasAge = this.age !== undefined;
  const hasRoomType = this.roomType !== undefined;
  const hasCapacity = this.capacity !== undefined;
  const hasRevision = this.revision !== undefined;
  const hasAmount = this.amountCents !== undefined;
  const hasCategoryCode = this.ageCategoryCode !== undefined;
  const hasBasisPoints = this.basisPoints !== undefined;
  const hasLessons = Array.isArray(this.lessons) && this.lessons.length > 0;
  const financial = [
    CATALOG_KIND.TUITION_RATE,
    CATALOG_KIND.MEAL_RATE,
    CATALOG_KIND.BENEFIT,
  ].includes(this.kind);
  const hasEffectiveFrom = this.effectiveFrom !== undefined;

  if (this.kind === CATALOG_KIND.AGE_CATEGORY) {
    return (
      hasAge &&
      !hasRoomType &&
      !hasCapacity &&
      !hasRevision &&
      !hasEffectiveFrom &&
      !hasAmount &&
      !hasCategoryCode &&
      !hasBasisPoints &&
      !hasLessons
    );
  }

  if (this.kind === CATALOG_KIND.ROOM) {
    if (
      hasAge ||
      !hasRoomType ||
      hasRevision ||
      hasEffectiveFrom ||
      hasAmount ||
      hasCategoryCode ||
      hasBasisPoints ||
      hasLessons
    ) {
      return false;
    }

    return this.roomType === ROOM_TYPE.GROUP ? hasCapacity : !hasCapacity;
  }

  if (this.kind === CATALOG_KIND.SETTINGS) {
    return (
      !hasAge &&
      !hasRoomType &&
      !hasCapacity &&
      hasRevision &&
      !hasEffectiveFrom &&
      !hasAmount &&
      !hasCategoryCode &&
      !hasBasisPoints &&
      !hasLessons
    );
  }

  if (this.kind === CATALOG_KIND.TUITION_RATE)
    return (
      hasEffectiveFrom &&
      hasAmount &&
      !hasCategoryCode &&
      !hasBasisPoints &&
      !hasLessons &&
      !hasAge &&
      !hasRoomType &&
      !hasCapacity &&
      !hasRevision &&
      Number.isSafeInteger(this.amountCents) &&
      this.amountCents >= 0
    );
  if (this.kind === CATALOG_KIND.MEAL_RATE)
    return (
      hasEffectiveFrom &&
      hasAmount &&
      hasCategoryCode &&
      !hasBasisPoints &&
      !hasLessons &&
      !hasAge &&
      !hasRoomType &&
      !hasCapacity &&
      !hasRevision &&
      Number.isSafeInteger(this.amountCents) &&
      this.amountCents >= 0 &&
      typeof this.ageCategoryCode === "string"
    );
  if (this.kind === CATALOG_KIND.BENEFIT)
    return (
      hasEffectiveFrom &&
      hasBasisPoints &&
      !hasAmount &&
      !hasCategoryCode &&
      !hasLessons &&
      !hasAge &&
      !hasRoomType &&
      !hasCapacity &&
      !hasRevision &&
      Number.isSafeInteger(this.basisPoints) &&
      this.basisPoints >= 0 &&
      this.basisPoints <= 10_000
    );
  if (this.kind === CATALOG_KIND.PROGRAM)
    return (
      hasEffectiveFrom &&
      hasLessons &&
      !hasAmount &&
      !hasCategoryCode &&
      !hasBasisPoints &&
      !hasAge &&
      !hasRoomType &&
      !hasCapacity &&
      !hasRevision
    );

  return (
    !financial &&
    !hasEffectiveFrom &&
    !hasAmount &&
    !hasCategoryCode &&
    !hasBasisPoints &&
    !hasLessons &&
    !hasAge &&
    !hasRoomType &&
    !hasCapacity &&
    !hasRevision
  );
}

const catalogSchema = new mongoose.Schema(
  {
    kind: {
      type: String,
      required: true,
      enum: Object.values(CATALOG_KIND),
    },
    code: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: CATALOG_LIMITS.MAX_CODE_LENGTH,
      match: /^[A-Z][A-Z0-9_]*$/,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: CATALOG_LIMITS.MAX_NAME_LENGTH,
    },
    active: {
      type: Boolean,
      required: true,
      default: true,
    },
    age: {
      type: Number,
      min: 0,
      max: 18,
      validate: Number.isSafeInteger,
    },
    roomType: {
      type: String,
      enum: Object.values(ROOM_TYPE),
    },
    capacity: {
      type: Number,
      min: CATALOG_LIMITS.MIN_GROUP_ROOM_CAPACITY,
      max: CATALOG_LIMITS.MAX_GROUP_ROOM_CAPACITY,
      validate: Number.isSafeInteger,
    },
    revision: {
      type: Number,
      min: 0,
      validate: Number.isSafeInteger,
    },
    effectiveFrom: { type: String, match: /^\d{4}-\d{2}-\d{2}$/ },
    amountCents: { type: Number, min: 0, validate: Number.isSafeInteger },
    ageCategoryCode: { type: String, match: /^[A-Z][A-Z0-9_]*$/ },
    basisPoints: {
      type: Number,
      min: 0,
      max: 10_000,
      validate: Number.isSafeInteger,
    },
    lessons: [
      {
        subjectCode: {
          type: String,
          required: true,
          match: /^[A-Z][A-Z0-9_]*$/,
        },
        sessionsPerWeek: {
          type: Number,
          required: true,
          min: 1,
          max: 20,
          validate: Number.isSafeInteger,
        },
        durationMinutes: {
          type: Number,
          required: true,
          min: 1,
          max: 240,
          validate: Number.isSafeInteger,
        },
      },
    ],
  },
  {
    collection: "catalog",
    strict: "throw",
    bufferCommands: false,
  },
);

catalogSchema.path("kind").validate({
  validator: validateKindFields,
  message: "Catalog fields do not match kind",
});

catalogSchema.index(
  { kind: 1, code: 1, effectiveFrom: 1 },
  { unique: true, name: "catalog_kind_code_effective_unique" },
);

export const CatalogModel = mongoose.model("Catalog", catalogSchema);
