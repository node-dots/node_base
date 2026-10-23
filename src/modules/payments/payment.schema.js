import { z as zod } from "../../openapi/zod.js";

export const createPendingPaymentSchema = zod.strictObject({
  invoiceId: zod.string().regex(/^[a-f\d]{24}$/i),
  amountCents: zod.number().int().safe().min(1),
  method: zod.enum(["BANK_TRANSFER", "CASH"]),
  idempotencyKey: zod
    .string()
    .trim()
    .min(8)
    .max(120)
    .regex(/^[A-Za-z0-9._:-]+$/),
  payerPersonId: zod
    .string()
    .regex(/^[a-f\d]{24}$/i)
    .optional(),
});
