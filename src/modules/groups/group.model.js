import mongoose from "mongoose";
import { GROUP_STATUS, GROUP_LIMITS } from "./group.constants.js";

const groupSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: GROUP_LIMITS.MIN_NAME_LENGTH,
      maxlength: GROUP_LIMITS.MAX_NAME_LENGTH,
    },
    ageCategory: {
      type: Number,
      required: true,
      min: GROUP_LIMITS.MIN_AGE_CATEGORY,
      max: GROUP_LIMITS.MAX_AGE_CATEGORY,
      validate: {
        validator: Number.isInteger,
        message: "Вікова категорія має бути цілим числом",
      },
    },
    capacity: {
      type: Number,
      required: true,
      min: GROUP_LIMITS.MIN_CAPACITY,
      max: GROUP_LIMITS.MAX_CAPACITY,
      validate: {
        validator: Number.isInteger,
        message: "Місткість має бути цілим числом",
      },
    },
    status: {
      type: String,
      required: true,
      enum: Object.values(GROUP_STATUS),
    },
    schoolYear: { type: String, match: /^\d{4}-\d{4}$/ },
    ageCategoryId: { type: mongoose.Schema.Types.ObjectId, ref: "Catalog" },
    roomId: { type: mongoose.Schema.Types.ObjectId, ref: "Catalog" },
    educatorId: { type: mongoose.Schema.Types.ObjectId, ref: "Person" },
    assistantId: { type: mongoose.Schema.Types.ObjectId, ref: "Person" },
    occupiedSeats: {
      type: Number,
      min: 0,
      max: GROUP_LIMITS.MAX_CAPACITY,
      validate: Number.isInteger,
      default: 0,
    },
  },
  {
    collection: "groups",
    strict: "throw",
    bufferCommands: false,
  },
);
groupSchema.pre("validate", function validateResources() {
  if (
    this.educatorId &&
    this.assistantId &&
    this.educatorId.equals(this.assistantId)
  ) {
    this.invalidate(
      "assistantId",
      "Educator and assistant must be different people",
    );
  }
  if (this.occupiedSeats > this.capacity) {
    this.invalidate("occupiedSeats", "Occupied seats cannot exceed capacity");
  }
});

groupSchema.index({ schoolYear: 1, roomId: 1, status: 1 });
groupSchema.index({ schoolYear: 1, educatorId: 1, status: 1 });
groupSchema.index({ schoolYear: 1, assistantId: 1, status: 1 });
export const GroupModel = mongoose.model("Group", groupSchema);
