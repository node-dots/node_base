import { z } from "../../openapi/zod.js";
import { GROUP_LIMITS } from "./group.constants.js";

const id = z.string().regex(/^[a-f\d]{24}$/i);
export const groupResourcesSchema = z.strictObject({
  schoolYear: z.string().regex(/^\d{4}-\d{4}$/),
  ageCategoryId: id,
  roomId: id,
  educatorId: id,
  assistantId: id,
  capacity: z
    .number()
    .int()
    .min(GROUP_LIMITS.MIN_CAPACITY)
    .max(GROUP_LIMITS.MAX_CAPACITY),
});

export const updateGroupCapacitySchema = z.strictObject({
  capacity: z
    .number()
    .int()
    .min(GROUP_LIMITS.MIN_CAPACITY)
    .max(GROUP_LIMITS.MAX_CAPACITY),
});
