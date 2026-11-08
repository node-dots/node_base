import { Router } from "express";
import { z as zod } from "../../openapi/zod.js";
import { validateBody } from "../../middleware/validateBody.js";
import { validateParams } from "../../middleware/validateParams.js";
import { validateQuery } from "../../middleware/validateQuery.js";
import { createAuthenticationMiddleware } from "../auth/auth.middleware.js";
import { createRequirePermission } from "../../middleware/requirePermission.js";
import { authorizer } from "../people/access/authorizer.js";
import { PERMISSIONS } from "../../utils/access/permissions.js";
import {
  createExpenseSchema,
  correctionSchema,
  payExpenseSchema,
} from "./expense.schema.js";
const idParams = zod.strictObject({
  expenseId: zod.string().regex(/^[a-f\d]{24}$/i),
});
const monthQuery = zod.strictObject({
  month: zod.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
});
export function createExpenseRoutes({
  service,
  openMonthService,
  authService,
}) {
  const router = Router();
  const auth = createAuthenticationMiddleware({ authService });
  const permission = (p) =>
    createRequirePermission({ authorizer, permission: p });
  const handler =
    (fn, status = 200) =>
    async (req, res, next) => {
      try {
        res.status(status).json({ data: await fn(req) });
      } catch (e) {
        next(e);
      }
    };
  router.post(
    "/",
    auth,
    permission(PERMISSIONS.EXPENSES_CREATE),
    validateBody(createExpenseSchema),
    handler((r) => service.create(r.validatedBody, r.actor, r.requestId), 201),
  );
  router.post(
    "/:expenseId/approve",
    auth,
    permission(PERMISSIONS.EXPENSES_APPROVE),
    validateParams(idParams),
    handler((r) =>
      service.approve(r.validatedParams.expenseId, r.actor, r.requestId),
    ),
  );
  router.post(
    "/:expenseId/pay",
    auth,
    permission(PERMISSIONS.EXPENSES_APPROVE),
    validateParams(idParams),
    validateBody(payExpenseSchema),
    handler((r) =>
      service.pay(
        r.validatedParams.expenseId,
        r.validatedBody,
        r.actor,
        r.requestId,
      ),
    ),
  );
  router.post(
    "/:expenseId/cancel",
    auth,
    permission(PERMISSIONS.EXPENSES_APPROVE),
    validateParams(idParams),
    handler((r) =>
      service.cancel(r.validatedParams.expenseId, r.actor, r.requestId),
    ),
  );
  router.post(
    "/:expenseId/corrections",
    auth,
    permission(PERMISSIONS.EXPENSES_APPROVE),
    validateParams(idParams),
    validateBody(correctionSchema),
    handler(
      (r) =>
        service.correct(
          r.validatedParams.expenseId,
          r.validatedBody,
          r.actor,
          r.requestId,
        ),
      201,
    ),
  );
  router.get(
    "/totals",
    auth,
    permission(PERMISSIONS.EXPENSES_READ),
    validateQuery(monthQuery),
    handler((r) => service.readTotals(r.validatedQuery.month, r.actor)),
  );
  if (openMonthService)
    router.post(
      "/open-current-month",
      auth,
      permission(PERMISSIONS.EXPENSES_APPROVE),
      handler(
        (r) => openMonthService.openCurrentMonth(r.actor, r.requestId),
        201,
      ),
    );
  return router;
}
