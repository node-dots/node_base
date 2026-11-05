import { HTTP_STATUS } from "../../utils/httpConstants.js";
import { configurationSearchSchema } from "./configurationSearch.schema.js";
import { z as zod } from "../../openapi/zod.js";

export function registerConfigurationSearchDocumentation(registry) {
  registry.register("ConfigurationSearchInput", configurationSearchSchema);
  registry.registerPath({
    method: "post",
    path: "/api/v1/finance/scenarios/compare-configurations",
    operationId: "compareFinancialConfigurations",
    tags: ["Finance scenarios"],
    security: [{ BearerAuth: [] }],
    request: {
      body: {
        required: true,
        content: { "application/json": { schema: configurationSearchSchema } },
      },
    },
    responses: {
      [HTTP_STATUS.OK]: {
        description:
          "Returns bounded best-found confirmed scenarios and minimum nonnegative scenarios among those checked; no production records are written.",
        content: {
          "application/json": {
            schema: zod.object({
              data: zod.object({
                bestFound: zod.unknown().nullable(),
                minimumGroupsNonnegative: zod.unknown().nullable(),
                confirmed: zod.array(zod.unknown()),
                unconfirmed: zod.array(zod.unknown()),
                rejected: zod.array(zod.unknown()),
                budget: zod.unknown(),
                bounds: zod.unknown(),
              }),
            }),
          },
        },
      },
      [HTTP_STATUS.BAD_REQUEST]: { description: "Scenario input is invalid." },
      [HTTP_STATUS.FORBIDDEN]: {
        description: "Financial scenario search is ADMIN-only.",
      },
    },
  });
}
