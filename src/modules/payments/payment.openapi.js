import { HTTP_STATUS } from "../../utils/httpConstants.js";
import { createPendingPaymentSchema } from "./payment.schema.js";
import { z as zod } from "../../openapi/zod.js";

export function registerPaymentDocumentation(registry) {
  registry.register("CreatePendingPaymentInput", createPendingPaymentSchema);
  registry.registerPath({
    method: "post",
    path: "/api/v1/payments",
    operationId: "reportPendingPayment",
    tags: ["Payments"],
    security: [{ BearerAuth: [] }],
    request: {
      body: {
        required: true,
        content: { "application/json": { schema: createPendingPaymentSchema } },
      },
    },
    responses: {
      [HTTP_STATUS.CREATED]: {
        description:
          "Payment report stored as PENDING; invoice totals remain unchanged.",
        content: {
          "application/json": {
            schema: zod.object({
              data: zod.object({
                id: zod.string(),
                invoiceId: zod.string(),
                amountCents: zod.number(),
                method: zod.enum(["BANK_TRANSFER", "CASH"]),
                status: zod.literal("PENDING"),
                reportedAt: zod.string(),
              }),
            }),
          },
        },
      },
      [HTTP_STATUS.CONFLICT]: {
        description:
          "Idempotency key was reused with a different payload or amount exceeds the current balance.",
      },
      [HTTP_STATUS.FORBIDDEN]: {
        description: "Payer cannot be supplied by a parent.",
      },
      [HTTP_STATUS.NOT_FOUND]: { $ref: "#/components/responses/NotFound" },
    },
  });
}
