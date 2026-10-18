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
  },
  {
    collection: "groups",
    strict: "throw",
    bufferCommands: false,
  },
);
export const GroupModel = mongoose.model("Group", groupSchema);
