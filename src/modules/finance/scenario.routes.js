import { Router } from "express";
import { createAuthenticationMiddleware } from "../auth/auth.middleware.js";
import { createRequirePermission } from "../../middleware/requirePermission.js";
import { authorizer } from "../people/access/authorizer.js";
import { PERMISSIONS } from "../../utils/access/permissions.js";
import { validateBody } from "../../middleware/validateBody.js";
import { breakevenSchema, scenarioSchema } from "./scenario.schema.js";

export function createScenarioRoutes({ authService, service }) {
  const router = Router();
  const authenticate = createAuthenticationMiddleware({ authService });
  const requireRun = createRequirePermission({
    authorizer,
    permission: PERMISSIONS.FINANCE_SCENARIOS_RUN,
  });
  router.post(
    "/forecast",
    authenticate,
    requireRun,
    validateBody(scenarioSchema),
    (req, res, next) => {
      try {
        res.json({ data: service.forecast(req.validatedBody, req.actor) });
      } catch (error) {
        next(error);
      }
    },
  );
  router.post(
    "/breakeven",
    authenticate,
    requireRun,
    validateBody(breakevenSchema),
    (req, res, next) => {
      try {
        res.json({ data: service.breakeven(req.validatedBody, req.actor) });
      } catch (error) {
        next(error);
      }
    },
  );
  return router;
}
