import { Router } from "express";
import { validateBody } from "../../middleware/validateBody.js";
import { validateParams } from "../../middleware/validateParams.js";
import { createAuthenticationMiddleware } from "../auth/auth.middleware.js";
import { createRequirePermission } from "../../middleware/requirePermission.js";
import { authorizer } from "../people/access/authorizer.js";
import { PERMISSIONS } from "../../utils/access/permissions.js";
import {
  confirmPaymentSchema,
  createPendingPaymentSchema,
  refundPaymentSchema,
} from "./payment.schema.js";
import { z as zod } from "../../openapi/zod.js";

const paymentIdParams = zod.strictObject({
  paymentId: zod.string().regex(/^[a-f\d]{24}$/i),
});

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
  router.post(
    "/:paymentId/confirm",
    createAuthenticationMiddleware({ authService }),
    createRequirePermission({
      authorizer,
      permission: PERMISSIONS.PAYMENTS_CONFIRM,
    }),
    validateParams(paymentIdParams),
    validateBody(confirmPaymentSchema),
    async (request, response, next) => {
      try {
        response.status(200).json({
          data: await service.confirm(
            request.params.paymentId,
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
  router.post(
    "/:paymentId/reject",
    createAuthenticationMiddleware({ authService }),
    createRequirePermission({
      authorizer,
      permission: PERMISSIONS.PAYMENTS_REJECT,
    }),
    validateParams(paymentIdParams),
    async (request, response, next) => {
      try {
        response.status(200).json({
          data: await service.reject(
            request.params.paymentId,
            request.actor,
            request.requestId,
          ),
        });
      } catch (error) {
        next(error);
      }
    },
  );
  router.post(
    "/:paymentId/refund",
    createAuthenticationMiddleware({ authService }),
    createRequirePermission({
      authorizer,
      permission: PERMISSIONS.PAYMENTS_REFUND,
    }),
    validateParams(paymentIdParams),
    validateBody(refundPaymentSchema),
    async (request, response, next) => {
      try {
        response.status(201).json({
          data: await service.refund(
            request.validatedParams.paymentId,
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
    "/:paymentId/refunds",
    createAuthenticationMiddleware({ authService }),
    createRequirePermission({
      authorizer,
      permission: PERMISSIONS.PAYMENTS_READ,
    }),
    validateParams(paymentIdParams),
    async (request, response, next) => {
      try {
        response.json({
          data: await service.listRefunds(
            request.validatedParams.paymentId,
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
