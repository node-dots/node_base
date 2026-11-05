import { z as zod } from "../../openapi/zod.js";
import { HTTP_STATUS } from "../../utils/httpConstants.js";

const month = zod.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
const responseSchema = zod.strictObject({
  data: zod.strictObject({
    month,
    accruedIncomeMinor: zod.number().int(),
    receiptsNetMinor: zod.number().int(),
    expensesMinor: zod.number().int(),
    resultMinor: zod.number().int(),
    cashFlowMinor: zod.number().int(),
    expenseBreakdown: zod.array(
      zod.strictObject({
        category: zod.enum(["RENT", "SALARY", "FOOD", "OTHER"]),
        amountMinor: zod.number().int(),
      }),
    ),
    currentOutstandingMinor: zod.number().int(),
    currentOverdueMinor: zod.number().int(),
    currentRefundDueMinor: zod.number().int(),
    asOf: zod.string().datetime(),
    notes: zod.array(zod.string()),
  }),
});
export function registerFinanceReportDocumentation(registry) {
  registry.register("MonthlyFinanceReportResponse", responseSchema);
  registry.registerPath({
    method: "get",
    path: "/api/v1/reports/finance/monthly",
    operationId: "getMonthlyFinanceReport",
    tags: ["Reports"],
    security: [{ BearerAuth: [] }],
    request: { query: zod.strictObject({ month }) },
    responses: {
      [HTTP_STATUS.OK]: {
        description:
          "ADMIN-only financial report. Monthly accrual, confirmed cash movements, approved expenses and paid expenses are separately aggregated. Current balance fields are asOf snapshots, not historical end-of-month balances.",
        content: { "application/json": { schema: responseSchema } },
      },
      [HTTP_STATUS.BAD_REQUEST]: {
        description: "Invalid or future actual month.",
      },
      [HTTP_STATUS.FORBIDDEN]: { description: "ADMIN permission required." },
    },
  });
}
