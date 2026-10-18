import mongoose from "mongoose";
import { PERSON_STATUS, PERSON_LIMITS } from "./person.constants.js";

const personSchema = new mongoose.Schema(
  {
    firstName: {
      type: String,
      required: true,
      trim: true,
      minlength: PERSON_LIMITS.MIN_NAME_LENGTH,
      maxlength: PERSON_LIMITS.MAX_NAME_LENGTH,
    },
    lastName: {
      type: String,
      required: true,
      trim: true,
      minlength: PERSON_LIMITS.MIN_NAME_LENGTH,
      maxlength: PERSON_LIMITS.MAX_NAME_LENGTH,
    },
    middleName: {
      type: String,
      trim: true,
      minlength: PERSON_LIMITS.MIN_NAME_LENGTH,
      maxlength: PERSON_LIMITS.MAX_NAME_LENGTH,
    },
    phone: {
      type: String,
      trim: true,
      minlength: 1,
      maxlength: PERSON_LIMITS.MAX_PHONE_LENGTH,
    },
    status: {
      type: String,
      required: true,
      enum: Object.values(PERSON_STATUS),
      default: PERSON_STATUS.ACTIVE,
    },
  },
  {
    collection: "people",
    strict: "throw",
    bufferCommands: false,
  },
);

export const PersonModel = mongoose.model("Person", personSchema);
