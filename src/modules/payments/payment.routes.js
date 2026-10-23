import { Router } from "express";
import { validateBody } from "../../middleware/validateBody.js";
import { createAuthenticationMiddleware } from "../auth/auth.middleware.js";
import { createRequirePermission } from "../../middleware/requirePermission.js";
import { authorizer } from "../people/access/authorizer.js";
import { PERMISSIONS } from "../../utils/access/permissions.js";
import { createPendingPaymentSchema } from "./payment.schema.js";

export function createPaymentRoutes({ service, authService }) {
  if (!authService)
    throw new TypeError("authService is required for payment routes");
  const router = Router();
  router.post(
    "/",
    createAuthenticationMiddleware({ authService }),
    createRequirePermission({
      authorizer,
      permission: PERMISSIONS.PAYMENTS_CREATE,
    }),
    validateBody(createPendingPaymentSchema),
    async (request, response, next) => {
      try {
        response.status(201).json({
          data: await service.reportPending(
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
  return router;
}
