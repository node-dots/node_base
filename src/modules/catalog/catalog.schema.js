import { z as zod } from "../../openapi/zod.js";
import {
  CATALOG_KIND,
  CATALOG_LIMITS,
  ROOM_TYPE,
} from "./catalog.constants.js";

const codeSchema = zod
  .string()
  .trim()
  .min(1)
  .max(CATALOG_LIMITS.MAX_CODE_LENGTH)
  .regex(/^[A-Z][A-Z0-9_]*$/);

const nameSchema = zod
  .string()
  .trim()
  .min(1)
  .max(CATALOG_LIMITS.MAX_NAME_LENGTH);

const common = {
  code: codeSchema,
  name: nameSchema,
  active: zod.boolean().default(true),
};

export const ageCategoryCatalogSchema = zod.strictObject({
  kind: zod.literal(CATALOG_KIND.AGE_CATEGORY),
  ...common,
  age: zod.number().int().min(0).max(18),
});

export const roomCatalogSchema = zod
  .strictObject({
    kind: zod.literal(CATALOG_KIND.ROOM),
    ...common,
    roomType: zod.enum(Object.values(ROOM_TYPE)),
    capacity: zod
      .number()
      .int()
      .min(CATALOG_LIMITS.MIN_GROUP_ROOM_CAPACITY)
      .max(CATALOG_LIMITS.MAX_GROUP_ROOM_CAPACITY)
      .optional(),
  })
  .superRefine((room, context) => {
    if (room.roomType === ROOM_TYPE.GROUP && room.capacity === undefined) {
      context.addIssue({
        code: "custom",
        path: ["capacity"],
        message: "Групова кімната повинна мати місткість",
      });
    }

    if (room.roomType === ROOM_TYPE.SERVICE && room.capacity !== undefined) {
      context.addIssue({
        code: "custom",
        path: ["capacity"],
        message: "Службова кімната не має групової місткості",
      });
    }
  });

export const positionCatalogSchema = zod.strictObject({
  kind: zod.literal(CATALOG_KIND.POSITION),
  ...common,
});

export const subjectCatalogSchema = zod.strictObject({
  kind: zod.literal(CATALOG_KIND.SUBJECT),
  ...common,
});

export const catalogEntrySchema = zod.union([
  ageCategoryCatalogSchema,
  roomCatalogSchema,
  positionCatalogSchema,
  subjectCatalogSchema,
]);
