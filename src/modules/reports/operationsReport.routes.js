import { Router } from "express";
import { z as zod } from "../../openapi/zod.js";
import { validateQuery } from "../../middleware/validateQuery.js";
import { createAuthenticationMiddleware } from "../auth/auth.middleware.js";
import { createRequirePermission } from "../../middleware/requirePermission.js";
import { authorizer } from "../people/access/authorizer.js";
import { PERMISSIONS } from "../../utils/access/permissions.js";

const monthQuery = zod.strictObject({
  month: zod.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
});
const weekQuery = zod.strictObject({
  weekStart: zod.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
export function createOperationsReportRoutes({ service, authService }) {
  const router = Router();
  const authenticate = createAuthenticationMiddleware({ authService });
  const respond = (fn) => async (req, res, next) => {
    try {
      res.json({ data: await fn(req) });
    } catch (error) {
      next(error);
    }
  };
  router.get(
    "/operations/benefits",
    authenticate,
    createRequirePermission({
      authorizer,
      permission: PERMISSIONS.REPORTS_OPERATIONS_READ,
    }),
    validateQuery(monthQuery),
    respond((req) => service.benefits(req.validatedQuery.month, req.actor)),
  );
  router.get(
    "/operations/teacher-load",
    authenticate,
    validateQuery(weekQuery),
    respond((req) =>
      service.teacherLoad(req.validatedQuery.weekStart, req.actor),
    ),
  );
  router.get(
    "/finance/expense-categories",
    authenticate,
    createRequirePermission({
      authorizer,
      permission: PERMISSIONS.REPORTS_FINANCE_READ,
    }),
    validateQuery(monthQuery),
    respond((req) =>
      service.expenseCategories(req.validatedQuery.month, req.actor),
    ),
  );
  return router;
}
