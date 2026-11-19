import { z as zod } from "../../openapi/zod.js";
import { parseCalendarDate } from "../../utils/calendar.js";
import { CHILD_LIMITS } from "./child.constants.js";

const objectIdSchema = zod
  .string()
  .regex(/^[a-f\d]{24}$/i, "Invalid identifier");
const nameSchema = zod.string().trim().min(1).max(CHILD_LIMITS.MAX_NAME_LENGTH);
const relationshipSchema = zod
  .string()
  .trim()
  .min(1)
  .max(CHILD_LIMITS.MAX_RELATIONSHIP_LENGTH);
const noteSchema = zod.string().trim().max(CHILD_LIMITS.MAX_NOTE_LENGTH);
const foodItemSchema = zod
  .string()
  .trim()
  .min(1)
  .max(CHILD_LIMITS.MAX_FOOD_ITEM_LENGTH);

const dateOfBirthSchema = zod.string().refine(
  (value) => {
    try {
      parseCalendarDate(value);
      return true;
    } catch {
      return false;
    }
  },
  { message: "dateOfBirth must be a valid YYYY-MM-DD calendar date" },
);

export const guardianSchema = zod.strictObject({
  personId: objectIdSchema,
  relationship: relationshipSchema,
});

export const relativeSchema = zod.strictObject({
  name: nameSchema,
  relationship: relationshipSchema,
  contact: zod.string().trim().max(CHILD_LIMITS.MAX_CONTACT_LENGTH).optional(),
  note: noteSchema.optional(),
});

export const foodDataSchema = zod.strictObject({
  preferences: zod
    .array(foodItemSchema)
    .max(CHILD_LIMITS.MAX_FOOD_ITEMS)
    .default([]),
  exclusions: zod
    .array(foodItemSchema)
    .max(CHILD_LIMITS.MAX_FOOD_ITEMS)
    .default([]),
  allergyNotes: zod
    .array(foodItemSchema)
    .max(CHILD_LIMITS.MAX_FOOD_ITEMS)
    .default([]),
  note: noteSchema.optional(),
});

const editableChildFields = {
  firstName: nameSchema,
  lastName: nameSchema,
  middleName: nameSchema.optional(),
  dateOfBirth: dateOfBirthSchema,
  guardians: zod
    .array(guardianSchema)
    .max(CHILD_LIMITS.MAX_GUARDIANS)
    .default([]),
  relatives: zod
    .array(relativeSchema)
    .max(CHILD_LIMITS.MAX_RELATIVES)
    .default([]),
  food: foodDataSchema.default({}),
};

const foodUpdateSchema = zod
  .strictObject({
    preferences: zod
      .array(foodItemSchema)
      .max(CHILD_LIMITS.MAX_FOOD_ITEMS)
      .optional(),
    exclusions: zod
      .array(foodItemSchema)
      .max(CHILD_LIMITS.MAX_FOOD_ITEMS)
      .optional(),
    allergyNotes: zod
      .array(foodItemSchema)
      .max(CHILD_LIMITS.MAX_FOOD_ITEMS)
      .optional(),
    note: noteSchema.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one nutrition field is required",
  });

export const parentNutritionUpdateSchema = zod.strictObject({
  food: zod
    .strictObject({
      preferences: zod
        .array(foodItemSchema)
        .max(CHILD_LIMITS.MAX_FOOD_ITEMS)
        .optional(),
      exclusions: zod
        .array(foodItemSchema)
        .max(CHILD_LIMITS.MAX_FOOD_ITEMS)
        .optional(),
      allergyNotes: zod
        .array(foodItemSchema)
        .max(CHILD_LIMITS.MAX_FOOD_ITEMS)
        .optional(),
    })
    .refine((value) => Object.keys(value).length > 0, {
      message: "At least one nutrition field is required",
    }),
});

export const createChildSchema = zod
  .strictObject(editableChildFields)
  .meta({ id: "CreateChildInput" });

export const updateChildProfileSchema = zod
  .strictObject({
    firstName: nameSchema.optional(),
    lastName: nameSchema.optional(),
    middleName: nameSchema.optional(),
    dateOfBirth: dateOfBirthSchema.optional(),
    guardians: zod
      .array(guardianSchema)
      .max(CHILD_LIMITS.MAX_GUARDIANS)
      .optional(),
    relatives: zod
      .array(relativeSchema)
      .max(CHILD_LIMITS.MAX_RELATIVES)
      .optional(),
    food: foodUpdateSchema.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one editable field is required",
  })
  .meta({ id: "UpdateChildProfileInput" });
