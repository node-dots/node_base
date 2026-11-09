import { Router } from "express";
import { z as zod } from "../../openapi/zod.js";
import { validateQuery } from "../../middleware/validateQuery.js";
import { createAuthenticationMiddleware } from "../auth/auth.middleware.js";
import { createRequirePermission } from "../../middleware/requirePermission.js";
import { authorizer } from "../people/access/authorizer.js";
import { PERMISSIONS } from "../../utils/access/permissions.js";

const querySchema = zod.strictObject({
  month: zod.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
});
export function createFinanceReportRoutes({ service, authService }) {
  const router = Router();
  router.get(
    "/monthly",
    createAuthenticationMiddleware({ authService }),
    createRequirePermission({
      authorizer,
      permission: PERMISSIONS.REPORTS_FINANCE_READ,
    }),
    validateQuery(querySchema),
    async (req, res, next) => {
      try {
        res.json({
          data: await service.monthly(req.validatedQuery.month, req.actor),
        });
      } catch (error) {
        next(error);
      }
    },
  );
  return router;
}
