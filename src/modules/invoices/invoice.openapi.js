import { z as zod } from "../../openapi/zod.js";
import { HTTP_STATUS } from "../../utils/httpConstants.js";

const childId = zod.object({ childId: zod.string().regex(/^[a-f\d]{24}$/i) });

export function registerInvoiceDocumentation(registry) {
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
