import { Router } from "express";
import { z as zod } from "../../openapi/zod.js";
import { validateParams } from "../../middleware/validateParams.js";
import { createAuthenticationMiddleware } from "../auth/auth.middleware.js";
import { createRequirePermission } from "../../middleware/requirePermission.js";
import { authorizer } from "../people/access/authorizer.js";
import { PERMISSIONS } from "../../utils/access/permissions.js";

const childIdParams = zod.strictObject({
  childId: zod.string().regex(/^[a-f\d]{24}$/i),
});

export function createInvoiceRoutes({ service, authService }) {
  if (!authService)
    throw new TypeError("authService is required for invoice routes");
  const router = Router();
  const authenticate = createAuthenticationMiddleware({ authService });
  router.post(
    "/children/:childId/generate-current-month",
    authenticate,
    createRequirePermission({
      authorizer,
      permission: PERMISSIONS.INVOICES_CREATE,
    }),
    validateParams(childIdParams),
    async (request, response, next) => {
      try {
        response.json({
          data: await service.generateForCurrentMonth(
            request.validatedParams.childId,
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
    "/children/:childId",
    authenticate,
    createRequirePermission({
      authorizer,
      permission: PERMISSIONS.INVOICES_READ,
    }),
    validateParams(childIdParams),
    async (request, response, next) => {
      try {
        response.json({
          data: await service.listForChild(
            request.validatedParams.childId,
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
