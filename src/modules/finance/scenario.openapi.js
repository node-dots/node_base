import { HTTP_STATUS } from "../../utils/httpConstants.js";
import { breakevenSchema, scenarioSchema } from "./scenario.schema.js";
import { z as zod } from "../../openapi/zod.js";

export function registerScenarioDocumentation(registry) {
  registry.register("FinancialScenario", scenarioSchema);
  registry.register("FinancialBreakevenInput", breakevenSchema);
  for (const [path, method, operationId, schema, description] of [
    [
      "/api/v1/finance/scenarios/forecast",
      "post",
      "forecastFinancialScenario",
      scenarioSchema,
      "Calculates a stable-month forecast from caller-supplied snapshots without writing production records.",
    ],
    [
      "/api/v1/finance/scenarios/breakeven",
      "post",
      "findFinancialBreakeven",
      breakevenSchema,
      "Scans the bounded deterministic demand sequence for fixed resources; this does not establish schedule feasibility.",
    ],
  ])
    registry.registerPath({
      method,
      path,
      operationId,
      tags: ["Finance scenarios"],
      security: [{ BearerAuth: [] }],
      request: {
        body: { required: true, content: { "application/json": { schema } } },
      },
      responses: {
        [HTTP_STATUS.OK]: { description },
        [HTTP_STATUS.BAD_REQUEST]: {
          description: "Scenario input is invalid.",
        },
        [HTTP_STATUS.FORBIDDEN]: {
          description: "Financial scenario access is ADMIN-only.",
        },
      },
    });
}
