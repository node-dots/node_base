import { z as zod } from "../../openapi/zod.js";
import { HTTP_STATUS } from "../../utils/httpConstants.js";
import {
  createExpenseSchema,
  correctionSchema,
  payExpenseSchema,
} from "./expense.schema.js";

export function registerExpenseDocumentation(registry) {
  registry.register("CreateExpenseInput", createExpenseSchema);
  registry.register("ExpenseCorrectionInput", correctionSchema);
  registry.register("PayExpenseInput", payExpenseSchema);
  const secured = [{ BearerAuth: [] }];
  registry.registerPath({
    method: "post",
    path: "/api/v1/expenses/open-current-month",
    operationId: "openCurrentFinanceMonth",
    tags: ["Expenses"],
    security: secured,
    responses: {
      [HTTP_STATUS.CREATED]: {
        description:
          "Atomically snapshots current rent, active payroll, occupancy, month marker, and audit; repeated calls return the stored snapshot.",
      },
      [HTTP_STATUS.FORBIDDEN]: { description: "ADMIN permission required." },
      [HTTP_STATUS.CONFLICT]: {
        description: "The month snapshot could not be completed.",
      },
    },
  });
  registry.registerPath({
    method: "post",
    path: "/api/v1/expenses",
    operationId: "createExpenseDraft",
    tags: ["Expenses"],
    security: secured,
    request: {
      body: {
        required: true,
        content: { "application/json": { schema: createExpenseSchema } },
      },
    },
    responses: {
      [HTTP_STATUS.CREATED]: {
        description:
          "Creates a DRAFT expense with separate service month and payment date.",
      },
      [HTTP_STATUS.FORBIDDEN]: { description: "Insufficient permission." },
    },
  });
  for (const [action, schema] of [
    ["approve", null],
    ["pay", payExpenseSchema],
    ["cancel", null],
    ["corrections", correctionSchema],
  ]) {
    registry.registerPath({
      method: "post",
      path: `/api/v1/expenses/{expenseId}/${action}`,
      operationId: `${action}Expense`,
      tags: ["Expenses"],
      security: secured,
      request: {
        params: zod.object({ expenseId: zod.string().regex(/^[a-f\d]{24}$/i) }),
        ...(schema
          ? {
              body: {
                required: true,
                content: { "application/json": { schema } },
              },
            }
          : {}),
      },
      responses: {
        [action === "corrections" ? HTTP_STATUS.CREATED : HTTP_STATUS.OK]: {
          description:
            action === "pay"
              ? "Pays the approved expense once and records actual payment date."
              : "Applies an audited expense state transition or linked correction.",
        },
        [HTTP_STATUS.CONFLICT]: {
          description:
            "Invalid state transition, duplicate payment, or correction violates net amount rules.",
        },
      },
    });
  }
  registry.registerPath({
    method: "get",
    path: "/api/v1/expenses/totals",
    operationId: "getExpenseTotals",
    tags: ["Expenses"],
    security: secured,
    request: {
      query: zod.object({
        month: zod.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
      }),
    },
    responses: {
      [HTTP_STATUS.OK]: {
        description:
          "Returns approved service-period totals separately from cash outflow by payment date.",
      },
    },
  });
}
