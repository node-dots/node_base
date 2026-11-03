import { z as zod } from "../../openapi/zod.js";

const code = zod.string().regex(/^[A-Z][A-Z0-9_]*$/);
const amount = zod.number().int().safe().nonnegative();
export const scenarioSchema = zod.strictObject({
  groups: zod
    .array(
      zod.strictObject({
        id: zod.string().min(1).max(80),
        age: zod.number().int().min(2).max(5),
        capacity: zod.number().int().min(1).max(100),
      }),
    )
    .min(1)
    .max(15),
  ages: zod
    .array(
      zod.strictObject({
        code,
        age: zod.number().int().min(2).max(5),
        demand: zod.number().int().min(0).max(10_000),
        tariffMinor: amount,
      }),
    )
    .min(1)
    .max(4),
  discountMix: zod
    .array(
      zod.strictObject({
        basisPoints: zod.number().int().min(0).max(10_000),
        shareBasisPoints: zod.number().int().min(0).max(10_000),
      }),
    )
    .min(1)
    .max(20),
  staff: zod
    .array(
      zod.strictObject({
        groupId: zod.string().min(1).max(80),
        positionCode: code,
        salaryMinor: amount,
      }),
    )
    .max(100),
  rentMinor: amount,
  otherCosts: zod
    .array(zod.strictObject({ code, amountMinor: amount }))
    .max(100),
  foodCostMinor: amount.optional(),
});
export const breakevenSchema = zod.strictObject({
  scenario: scenarioSchema,
  maxCandidates: zod.number().int().min(0).max(10_000).default(10_000),
});
