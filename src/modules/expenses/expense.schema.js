import { z as zod } from "../../openapi/zod.js";

const month = zod.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
export const createExpenseSchema = zod.strictObject({
  category: zod.enum(["RENT", "SALARY", "FOOD", "OTHER"]),
  amountCents: zod.number().int().safe().positive(),
  serviceMonth: month,
  reason: zod.string().trim().min(3).max(500),
});
export const correctionSchema = zod.strictObject({
  amountCents: zod
    .number()
    .int()
    .safe()
    .refine((amount) => amount !== 0),
  reason: zod.string().trim().min(3).max(500),
});
export const payExpenseSchema = zod.strictObject({
  paymentDate: zod.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
