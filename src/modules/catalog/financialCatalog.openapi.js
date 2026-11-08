import { z as zod } from "../../openapi/zod.js";
import { HTTP_STATUS } from "../../utils/httpConstants.js";
import { catalogEntrySchema } from "./catalog.schema.js";

export function registerFinancialCatalogDocumentation(registry) {
  registry.register("CatalogVersion", catalogEntrySchema);
  registry.registerPath({
    method: "post",
    path: "/api/v1/catalog/versions",
    operationId: "createCatalogVersion",
    tags: ["Catalog"],
    security: [{ BearerAuth: [] }],
    request: {
      body: {
        required: true,
        content: { "application/json": { schema: catalogEntrySchema } },
      },
    },
    responses: {
      [HTTP_STATUS.CREATED]: {
        description: "Immutable dated catalog version created.",
      },
      [HTTP_STATUS.BAD_REQUEST]: { $ref: "#/components/responses/BadRequest" },
      [HTTP_STATUS.CONFLICT]: {
        description: "Version for this code and date already exists.",
      },
    },
  });
  registry.registerPath({
    method: "get",
    path: "/api/v1/catalog/versions/{kind}/{code}",
    operationId: "getCatalogVersionForDate",
    tags: ["Catalog"],
    security: [{ BearerAuth: [] }],
    request: {
      params: zod.object({ kind: zod.string(), code: zod.string() }),
      query: zod.object({ date: zod.string() }),
    },
    responses: {
      [HTTP_STATUS.OK]: {
        description: "Latest version effective on the requested date.",
      },
      [HTTP_STATUS.NOT_FOUND]: { $ref: "#/components/responses/NotFound" },
    },
  });
}
