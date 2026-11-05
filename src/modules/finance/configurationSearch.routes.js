import { Router, json } from "express";
import { createAuthenticationMiddleware } from "../auth/auth.middleware.js";
import { createRequirePermission } from "../../middleware/requirePermission.js";
import { authorizer } from "../people/access/authorizer.js";
import { PERMISSIONS } from "../../utils/access/permissions.js";
import { validateBody } from "../../middleware/validateBody.js";
import { configurationSearchSchema } from "./configurationSearch.schema.js";

export function createConfigurationSearchRoutes({ authService, service }) {
  const router = Router();
  const authenticate = createAuthenticationMiddleware({ authService });
  const requireRun = createRequirePermission({
    authorizer,
    permission: PERMISSIONS.FINANCE_SCENARIOS_RUN,
  });
  const scenarioJsonParser = json({ limit: "512kb" });
  router.post(
    "/compare-configurations",
    authenticate,
    requireRun,
    scenarioJsonParser,
    validateBody(configurationSearchSchema),
    async (req, res, next) => {
      try {
        res.json({ data: await service.compare(req.validatedBody, req.actor) });
      } catch (error) {
        next(error);
      }
    },
  );
  return router;
}
