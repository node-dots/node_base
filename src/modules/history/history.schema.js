import { z as zod } from "../../openapi/zod.js";

export const HISTORY_ENTITY_TYPES = Object.freeze([
  "GROUP",
  "CHILD",
  "PERSON",
  "CATALOG",
  "INVOICE",
  "PAYMENT",
  "REFUND",
  "EXPENSE",
  "SCHEDULE",
]);

export const historyListQuerySchema = zod.strictObject({
  entityType: zod.enum(HISTORY_ENTITY_TYPES).optional(),
  entityId: zod.string().min(1).max(128).optional(),
  version: zod.coerce.number().int().min(1).optional(),
  from: zod.string().datetime().optional(),
  to: zod.string().datetime().optional(),
  page: zod.coerce.number().int().min(1).default(1),
  pageSize: zod.coerce.number().int().min(1).max(100).default(50),
});

export const historyEntityParamsSchema = zod.strictObject({
  entityType: zod.enum(HISTORY_ENTITY_TYPES),
  entityId: zod.string().min(1).max(128),
});

export const historyVersionParamsSchema = historyEntityParamsSchema.extend({
  version: zod.coerce.number().int().min(1),
});

export const historyCompareQuerySchema = zod.strictObject({
  fromVersion: zod.coerce.number().int().min(1),
  toVersion: zod.coerce.number().int().min(1),
});
