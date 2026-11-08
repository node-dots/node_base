import mongoose from "mongoose";
import {
  ACCOUNT_ROLE,
  EMPLOYEE_STATUS,
  PERSON_STATUS,
  PERSON_LIMITS,
} from "./person.constants.js";
import { POSITION_CODE } from "../catalog/catalog.constants.js";

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
      enum: Object.values(POSITION_CODE),
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
    subjectCode: {
      type: String,
      trim: true,
      uppercase: true,
      match: /^[A-Z][A-Z0-9_]*$/,
    },
    startedAt: { type: String, match: /^\d{4}-\d{2}-\d{2}$/ },
    endedAt: { type: String, match: /^\d{4}-\d{2}-\d{2}$/ },
    availability: {
      type: [
        {
          weekday: {
            type: Number,
            required: true,
            min: 1,
            max: 5,
            validate: Number.isInteger,
          },
          startTime: {
            type: String,
            required: true,
            match: /^(09|1[0-6]):(00|15|30|45)$/,
          },
          endTime: {
            type: String,
            required: true,
            match: /^(?:(?:09|1[0-6]):(?:00|15|30|45)|17:00)$/,
          },
        },
      ],
      default: [],
      validate: (windows) => windows.length <= 20,
    },
  },
  { _id: false, strict: "throw" },
);

employeeSchema.pre("validate", function validateEmployee() {
  if (this.positionCode === POSITION_CODE.TEACHER && !this.subjectCode) {
    this.invalidate("subjectCode", "Teacher requires one subject");
  }
  if (this.positionCode !== POSITION_CODE.TEACHER && this.subjectCode) {
    this.invalidate("subjectCode", "Only teachers can have a subject");
  }
  if (this.status === EMPLOYEE_STATUS.TERMINATED && !this.endedAt) {
    this.invalidate("endedAt", "Terminated employee requires an end date");
  }
  const windows = this.availability ?? [];
  const normalized = windows.map(({ weekday, startTime, endTime }) => ({
    weekday,
    startTime,
    endTime,
  }));
  const unique = new Set(
    normalized.map(
      ({ weekday, startTime, endTime }) => `${weekday}:${startTime}-${endTime}`,
    ),
  );
  if (unique.size !== normalized.length)
    this.invalidate("availability", "Availability windows must be unique");
  for (let i = 0; i < normalized.length; i += 1) {
    const current = normalized[i];
    if (current.startTime >= current.endTime)
      this.invalidate(
        "availability",
        "Availability window must have positive duration",
      );
    for (let j = i + 1; j < normalized.length; j += 1) {
      const other = normalized[j];
      if (
        current.weekday === other.weekday &&
        current.startTime < other.endTime &&
        other.startTime < current.endTime
      ) {
        this.invalidate(
          "availability",
          "Availability windows must not overlap",
        );
      }
    }
  }
});

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
