import { Router } from "express";
import { z as zod } from "../../openapi/zod.js";
import { validateBody } from "../../middleware/validateBody.js";
import { validateParams } from "../../middleware/validateParams.js";
import { validateQuery } from "../../middleware/validateQuery.js";
import { createAuthenticationMiddleware } from "../auth/auth.middleware.js";
import { createRequirePermission } from "../../middleware/requirePermission.js";
import { authorizer } from "../people/access/authorizer.js";
import { PERMISSIONS } from "../../utils/access/permissions.js";
import { catalogEntrySchema } from "./catalog.schema.js";
import { CATALOG_KIND } from "./catalog.constants.js";

const paramsSchema = zod.strictObject({
  kind: zod.enum(Object.values(CATALOG_KIND)),
  code: zod.string().min(1),
});
const querySchema = zod.strictObject({
  date: zod.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export function createFinancialCatalogRoutes({ service, authService }) {
  if (!authService)
    throw new TypeError("authService is required for catalog routes");
  const router = Router();
  const authenticate = createAuthenticationMiddleware({ authService });
  router.post(
    "/versions",
    authenticate,
    createRequirePermission({
      authorizer,
      permission: PERMISSIONS.CATALOG_CREATE,
    }),
    validateBody(catalogEntrySchema),
    async (request, response, next) => {
      try {
        response.status(201).json({
          data: await service.createVersion(
            request.validatedBody,
            request.actor,
            request.requestId,
          ),
        });
      } catch (error) {
        next(error);
      }
    },
  );
  router.get(
    "/versions/:kind/:code",
    authenticate,
    createRequirePermission({
      authorizer,
      permission: PERMISSIONS.CATALOG_READ,
    }),
    validateParams(paramsSchema),
    validateQuery(querySchema),
    async (request, response, next) => {
      try {
        response.json({
          data: await service.getForDate(
            request.validatedParams.kind,
            request.validatedParams.code,
            request.validatedQuery.date,
            request.actor,
          ),
        });
      } catch (error) {
        next(error);
      }
    },
  );
  return router;
}
