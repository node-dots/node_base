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

  if (this.kind === CATALOG_KIND.AGE_CATEGORY) {
    return hasAge && !hasRoomType && !hasCapacity;
  }

  if (this.kind === CATALOG_KIND.ROOM) {
    if (hasAge || !hasRoomType) {
      return false;
    }

    return this.roomType === ROOM_TYPE.GROUP ? hasCapacity : !hasCapacity;
  }

  return !hasAge && !hasRoomType && !hasCapacity;
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
  { kind: 1, code: 1 },
  { unique: true, name: "catalog_kind_code_unique" },
);

export const CatalogModel = mongoose.model("Catalog", catalogSchema);
