import { z as zod } from "../../openapi/zod.js";
import { HTTP_STATUS } from "../../utils/httpConstants.js";

const monthQuery = zod.strictObject({
  month: zod.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
});
const benefitsResponse = zod.strictObject({
  data: zod.strictObject({
    month: zod.string(),
    status: zod.array(zod.enum(["ACTIVE", "SUSPENDED"])),
    distribution: zod.array(
      zod.strictObject({
        benefitCode: zod.string(),
        basisPoints: zod.number().int(),
        childrenCount: zod.number().int(),
      }),
    ),
  }),
});
const teacherLoadResponse = zod.strictObject({
  data: zod.strictObject({
    weekStart: zod.string(),
    status: zod.literal("PUBLISHED"),
    teachers: zod.array(
      zod.strictObject({
        teacherId: zod.string(),
        slotsCount: zod.number().int(),
        groupsCount: zod.number().int(),
        subjects: zod.array(zod.string()),
      }),
    ),
  }),
});
const expensesResponse = zod.strictObject({
  data: zod.strictObject({
    month: zod.string(),
    status: zod.literal("APPROVED"),
    totalMinor: zod.number().int(),
    categories: zod.array(
      zod.strictObject({
        category: zod.enum(["RENT", "SALARY", "FOOD", "OTHER"]),
        amountMinor: zod.number().int(),
        entriesCount: zod.number().int(),
      }),
    ),
  }),
});
export function registerOperationsReportDocumentation(registry) {
  registry.register("BenefitDistributionReportResponse", benefitsResponse);
  registry.register("PublishedTeacherLoadResponse", teacherLoadResponse);
  registry.register("ExpenseCategoryReportResponse", expensesResponse);
  registry.registerPath({
    method: "get",
    path: "/api/v1/reports/operations/benefits",
    operationId: "getBenefitDistributionReport",
    tags: ["Reports"],
    security: [{ BearerAuth: [] }],
    request: { query: monthQuery },
    responses: {
      [HTTP_STATUS.OK]: {
        description:
          "Aggregation of current benefit rates for ACTIVE/SUSPENDED children, without child identities.",
        content: { "application/json": { schema: benefitsResponse } },
      },
      [HTTP_STATUS.FORBIDDEN]: {
        description: "Operations report permission required.",
      },
    },
  });
  registry.registerPath({
    method: "get",
    path: "/api/v1/reports/operations/teacher-load",
    operationId: "getPublishedTeacherLoadReport",
    tags: ["Reports"],
    security: [{ BearerAuth: [] }],
    request: {
      query: zod.strictObject({
        weekStart: zod.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      }),
    },
    responses: {
      [HTTP_STATUS.OK]: {
        description:
          "Published schedule only. A teacher receives only their own slot counts; draft slots are excluded.",
        content: { "application/json": { schema: teacherLoadResponse } },
      },
      [HTTP_STATUS.FORBIDDEN]: {
        description:
          "Only that teacher or authorized operations staff may read the report.",
      },
    },
  });
  registry.registerPath({
    method: "get",
    path: "/api/v1/reports/finance/expense-categories",
    operationId: "getApprovedExpenseCategories",
    tags: ["Reports"],
    security: [{ BearerAuth: [] }],
    request: { query: monthQuery },
    responses: {
      [HTTP_STATUS.OK]: {
        description:
          "ADMIN-only approved expenses by category, including corrections; salary totals are not exposed to operations roles.",
        content: { "application/json": { schema: expensesResponse } },
      },
      [HTTP_STATUS.FORBIDDEN]: {
        description: "Finance report permission required.",
      },
    },
  });
}
