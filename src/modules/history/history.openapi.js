import { z as zod } from "../../openapi/zod.js";
import { jsonResponse } from "../../openapi/common.js";
import { HISTORY_ENTITY_TYPES } from "./history.schema.js";

const entityType = zod.enum(HISTORY_ENTITY_TYPES);
const snapshot = zod.unknown().nullable();
const versionSchema = zod.strictObject({
  id: zod.string(),
  entityType,
  entityId: zod.string(),
  version: zod.number().int().min(1),
  action: zod.enum(["CREATE", "UPDATE", "DELETE"]),
  changedAt: zod.string().datetime(),
  actorId: zod.string().nullable(),
  requestId: zod.string(),
  correlationId: zod.string().nullable(),
  source: zod.enum(["API", "SERVICE", "SEED", "MIGRATION", "OTHER"]),
  reason: zod.string().nullable(),
  before: snapshot,
  after: snapshot,
  changedFields: zod.array(zod.string()),
});

export function registerHistoryDocumentation(registry) {
  registry.register("EntityVersion", versionSchema);
  registry.registerPath({
    method: "get",
    path: "/api/v1/history",
    operationId: "listEntityVersions",
    tags: ["History"],
    security: [{ BearerAuth: [] }],
    request: {
      query: zod.strictObject({
        entityType: entityType.optional(),
        entityId: zod.string().optional(),
        version: zod.coerce.number().int().min(1).optional(),
        from: zod.string().datetime().optional(),
        to: zod.string().datetime().optional(),
        page: zod.coerce.number().int().min(1).default(1),
        pageSize: zod.coerce.number().int().min(1).max(100).default(50),
      }),
    },
    responses: {
      200: jsonResponse(
        zod.strictObject({
          data: zod.strictObject({
            versions: zod.array(versionSchema),
            pagination: zod.strictObject({
              page: zod.number().int(),
              pageSize: zod.number().int(),
              total: zod.number().int(),
              totalPages: zod.number().int(),
            }),
          }),
        }),
        "ADMIN-only append-only history search.",
      ),
      401: { description: "Authentication required." },
      403: { description: "ADMIN permission required." },
    },
  });
  registry.registerPath({
    method: "get",
    path: "/api/v1/history/{entityType}/{entityId}/versions/{version}",
    operationId: "getEntityVersion",
    tags: ["History"],
    security: [{ BearerAuth: [] }],
    request: {
      params: zod.strictObject({
        entityType,
        entityId: zod.string(),
        version: zod.coerce.number().int().min(1),
      }),
    },
    responses: {
      200: jsonResponse(zod.strictObject({ data: versionSchema }), "Version."),
      404: { description: "Version not found." },
    },
  });
  registry.registerPath({
    method: "get",
    path: "/api/v1/history/{entityType}/{entityId}/compare",
    operationId: "compareEntityVersions",
    tags: ["History"],
    security: [{ BearerAuth: [] }],
    request: {
      params: zod.strictObject({ entityType, entityId: zod.string() }),
      query: zod.strictObject({
        fromVersion: zod.coerce.number().int().min(1),
        toVersion: zod.coerce.number().int().min(1),
      }),
    },
    responses: {
      200: jsonResponse(
        zod.strictObject({
          data: zod.strictObject({
            entityType,
            entityId: zod.string(),
            fromVersion: zod.number().int(),
            toVersion: zod.number().int(),
            fromState: snapshot,
            toState: snapshot,
            changedFields: zod.array(zod.string()),
          }),
        }),
        "Two immutable states and changed paths.",
      ),
      404: { description: "Version not found." },
    },
  });
}
