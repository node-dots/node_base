import { Router } from "express";
import { createAuthenticationMiddleware } from "../auth/auth.middleware.js";
import { validateQuery } from "../../middleware/validateQuery.js";
import { validateParams } from "../../middleware/validateParams.js";
import {
  historyCompareQuerySchema,
  historyEntityParamsSchema,
  historyListQuerySchema,
  historyVersionParamsSchema,
} from "./history.schema.js";

function handler(callback) {
  return async (request, response, next) => {
    try {
      response.json({ data: await callback(request) });
    } catch (error) {
      next(error);
    }
  };
}

export function createHistoryRoutes({ service, authService }) {
  const router = Router();
  const authenticate = createAuthenticationMiddleware({ authService });
  router.get(
    "/",
    authenticate,
    validateQuery(historyListQuerySchema),
    handler((request) => service.list(request.validatedQuery, request.actor)),
  );
  router.get(
    "/:entityType/:entityId/compare",
    authenticate,
    validateParams(historyEntityParamsSchema),
    validateQuery(historyCompareQuerySchema),
    handler((request) =>
      service.compare(
        { ...request.validatedParams, ...request.validatedQuery },
        request.actor,
      ),
    ),
  );
  router.get(
    "/:entityType/:entityId/versions/:version",
    authenticate,
    validateParams(historyVersionParamsSchema),
    handler((request) =>
      service.getVersion(request.validatedParams, request.actor),
    ),
  );
  return router;
}
