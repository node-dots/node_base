import mongoose from "mongoose";
import {
  ACCOUNT_ROLE,
  EMPLOYEE_STATUS,
  PERSON_STATUS,
  PERSON_LIMITS,
} from "./person.constants.js";

const accountSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      maxlength: PERSON_LIMITS.MAX_EMAIL_LENGTH,
      match: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    },
    passwordHash: {
      type: String,
      required: true,
      minlength: 1,
      maxlength: PERSON_LIMITS.MAX_PASSWORD_HASH_LENGTH,
    },
    roles: {
      type: [String],
      required: true,
      enum: Object.values(ACCOUNT_ROLE),
      validate: [
        {
          validator: (roles) => roles.length > 0,
          message: "Account must have at least one role",
        },
        {
          validator: (roles) => new Set(roles).size === roles.length,
          message: "Account roles must be unique",
        },
      ],
    },
    enabled: {
      type: Boolean,
      required: true,
      default: true,
    },
    tokenVersion: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
      validate: Number.isSafeInteger,
    },
  },
  { _id: false, strict: "throw" },
);

const employeeSchema = new mongoose.Schema(
  {
    positionCode: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: PERSON_LIMITS.MAX_POSITION_CODE_LENGTH,
    },
    status: {
      type: String,
      required: true,
      enum: Object.values(EMPLOYEE_STATUS),
      default: EMPLOYEE_STATUS.ACTIVE,
    },
    salaryMinor: {
      type: Number,
      required: true,
      min: 0,
      validate: Number.isSafeInteger,
    },
  },
  { _id: false, strict: "throw" },
);

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
    account: {
      type: accountSchema,
      required: false,
    },
    employee: {
      type: employeeSchema,
      required: false,
    },
  },
  {
    collection: "people",
    strict: "throw",
    bufferCommands: false,
  },
);

// Люди без account не потрапляють до індексу й не конфліктують між собою.
personSchema.index(
  { "account.email": 1 },
  {
    unique: true,
    partialFilterExpression: { "account.email": { $type: "string" } },
    name: "people_account_email_unique",
  },
);

export const PersonModel = mongoose.model("Person", personSchema);
