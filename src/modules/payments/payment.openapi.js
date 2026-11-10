import { HTTP_STATUS } from "../../utils/httpConstants.js";
import {
  confirmPaymentSchema,
  createPendingPaymentSchema,
  refundPaymentSchema,
} from "./payment.schema.js";
import { z as zod } from "../../openapi/zod.js";

export function registerPaymentDocumentation(registry) {
  registry.registerPath({
    method: "get",
    path: "/api/v1/payments",
    operationId: "listPaymentsForMonth",
    tags: ["Payments"],
    security: [{ BearerAuth: [] }],
    request: {
      query: zod.strictObject({
        month: zod.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
        page: zod.coerce.number().int().min(1).default(1),
        pageSize: zod.coerce.number().int().min(1).max(100).default(50),
      }),
    },
    responses: {
      [HTTP_STATUS.OK]: {
        description:
          "Administrator-only paginated payment list for a service month.",
      },
      [HTTP_STATUS.FORBIDDEN]: { description: "Insufficient permission." },
    },
  });
  registry.register("CreatePendingPaymentInput", createPendingPaymentSchema);
  registry.register("ConfirmPaymentInput", confirmPaymentSchema);
  registry.register("RefundPaymentInput", refundPaymentSchema);
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
  for (const [action, operationId, permission, description] of [
    [
      "confirm",
      "confirmPayment",
      "payments:confirm",
      "Confirm a pending payment and atomically update the invoice and audit log.",
    ],
    [
      "reject",
      "rejectPayment",
      "payments:reject",
      "Reject a pending payment without changing invoice totals.",
    ],
  ]) {
    registry.registerPath({
      method: "post",
      path: `/api/v1/payments/{paymentId}/${action}`,
      operationId,
      tags: ["Payments"],
      security: [{ BearerAuth: [] }],
      ...(action === "confirm"
        ? {
            request: {
              body: {
                required: true,
                content: {
                  "application/json": { schema: confirmPaymentSchema },
                },
              },
            },
          }
        : {}),
      responses: {
        [HTTP_STATUS.OK]: { description },
        [HTTP_STATUS.CONFLICT]: {
          description: "Payment is no longer pending or exceeds the balance.",
        },
        [HTTP_STATUS.NOT_FOUND]: { $ref: "#/components/responses/NotFound" },
      },
    });
  }
  registry.registerPath({
    method: "post",
    path: "/api/v1/payments/{paymentId}/refund",
    operationId: "recordPaymentRefund",
    tags: ["Payments"],
    security: [{ BearerAuth: [] }],
    request: {
      params: zod.object({ paymentId: zod.string().regex(/^[a-f\d]{24}$/i) }),
      body: {
        required: true,
        content: { "application/json": { schema: refundPaymentSchema } },
      },
    },
    responses: {
      [HTTP_STATUS.CREATED]: {
        description:
          "Records an admin-confirmed refund atomically against a confirmed receipt, invoice refund due, child refund due, and audit log.",
      },
      [HTTP_STATUS.CONFLICT]: {
        description:
          "Refund exceeds the refund due or receipt balance, the receipt is not confirmed, or the idempotency key conflicts.",
      },
      [HTTP_STATUS.FORBIDDEN]: {
        description: "Only ADMIN may record a refund.",
      },
      [HTTP_STATUS.NOT_FOUND]: { $ref: "#/components/responses/NotFound" },
    },
  });
  registry.registerPath({
    method: "get",
    path: "/api/v1/payments/{paymentId}/refunds",
    operationId: "listPaymentRefunds",
    tags: ["Payments"],
    security: [{ BearerAuth: [] }],
    request: {
      params: zod.object({ paymentId: zod.string().regex(/^[a-f\d]{24}$/i) }),
    },
    responses: {
      [HTTP_STATUS.OK]: {
        description:
          "Lists refund records linked to this receipt without returning payer identity data.",
      },
      [HTTP_STATUS.NOT_FOUND]: { $ref: "#/components/responses/NotFound" },
      [HTTP_STATUS.FORBIDDEN]: { description: "Insufficient permission." },
    },
  });
}
