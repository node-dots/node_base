import { z as zod } from "../../openapi/zod.js";
import { HTTP_STATUS } from "../../utils/httpConstants.js";

const childId = zod.object({ childId: zod.string().regex(/^[a-f\d]{24}$/i) });

export function registerInvoiceDocumentation(registry) {
  registry.registerPath({
    method: "post",
    path: "/api/v1/invoices/children/{childId}/annual-tuition",
    operationId: "createAnnualTuitionInvoice",
    tags: ["Invoices"],
    security: [{ BearerAuth: [] }],
    request: {
      params: childId,
      body: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["firstMonth"],
              properties: {
                firstMonth: {
                  type: "string",
                  pattern: "^\\d{4}-(0[1-9]|1[0-2])$",
                },
              },
              additionalProperties: false,
            },
          },
        },
      },
    },
    responses: {
      [HTTP_STATUS.CREATED]: {
        description:
          "Creates and reserves 12 tuition months with exact cent allocation.",
      },
      [HTTP_STATUS.CONFLICT]: {
        description:
          "The payment window is closed or one of the tuition months is already reserved.",
      },
      [HTTP_STATUS.FORBIDDEN]: { description: "Insufficient permission." },
    },
  });
  registry.registerPath({
    method: "post",
    path: "/api/v1/invoices/children/{childId}/fallback-expired-annual",
    operationId: "fallbackExpiredAnnualTuition",
    tags: ["Invoices"],
    security: [{ BearerAuth: [] }],
    request: { params: childId },
    responses: {
      [HTTP_STATUS.OK]: {
        description:
          "Cancels an expired unpaid annual invoice and creates the current monthly tuition invoice idempotently.",
      },
      [HTTP_STATUS.CONFLICT]: {
        description: "No eligible expired unpaid annual invoice exists.",
      },
      [HTTP_STATUS.FORBIDDEN]: { description: "Insufficient permission." },
    },
  });
  registry.registerPath({
    method: "get",
    path: "/api/v1/invoices/children/{childId}",
    operationId: "listChildInvoices",
    tags: ["Invoices"],
    security: [{ BearerAuth: [] }],
    request: { params: childId },
    responses: {
      [HTTP_STATUS.OK]: {
        description:
          "Invoices visible to the child's guardian or finance staff.",
      },
      [HTTP_STATUS.NOT_FOUND]: { $ref: "#/components/responses/NotFound" },
      [HTTP_STATUS.FORBIDDEN]: { description: "Insufficient permission." },
    },
  });
  registry.registerPath({
    method: "post",
    path: "/api/v1/invoices/children/{childId}/generate-current-month",
    operationId: "generateCurrentMonthInvoices",
    tags: ["Invoices"],
    security: [{ BearerAuth: [] }],
    request: { params: childId },
    responses: {
      [HTTP_STATUS.OK]: {
        description:
          "Current month invoices generated idempotently. Missing prior months are reported, never rebuilt.",
      },
      [HTTP_STATUS.CONFLICT]: {
        description: "Required billing rule or child state is unavailable.",
      },
      [HTTP_STATUS.FORBIDDEN]: { description: "Insufficient permission." },
    },
  });
}
