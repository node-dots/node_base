import { Router, json } from "express";
import { createAuthenticationMiddleware } from "../auth/auth.middleware.js";
import { createRequirePermission } from "../../middleware/requirePermission.js";
import { authorizer } from "../people/access/authorizer.js";
import { PERMISSIONS } from "../../utils/access/permissions.js";
import {
  publishScheduleSchema,
  updateScheduleDraftSchema,
} from "./schedule.schema.js";
import { validateBody } from "../../middleware/validateBody.js";

const scheduleJsonParser = json({ limit: 512 * 1024 });

export function createScheduleRoutes({ service, authService }) {
  if (!authService)
    throw new TypeError("authService is required for schedules");
  const router = Router();
  const authenticate = createAuthenticationMiddleware({ authService });
  const requireEditor = createRequirePermission({
    authorizer,
    permission: PERMISSIONS.SCHEDULES_UPDATE,
  });
  router.get(
    "/:weekStart/draft",
    authenticate,
    requireEditor,
    async (req, res, next) => {
      try {
        res.json({
          data: await service.getDraft(req.params.weekStart, req.actor),
        });
      } catch (error) {
        next(error);
      }
    },
  );
  router.put(
    "/:weekStart/draft",
    authenticate,
    requireEditor,
    scheduleJsonParser,
    validateBody(updateScheduleDraftSchema),
    async (req, res, next) => {
      try {
        res.json({
          data: await service.updateDraft(
            req.params.weekStart,
            req.validatedBody,
            req.actor,
          ),
        });
      } catch (error) {
        next(error);
      }
    },
  );
  router.post(
    "/:weekStart/publish",
    authenticate,
    createRequirePermission({
      authorizer,
      permission: PERMISSIONS.SCHEDULES_PUBLISH,
    }),
    scheduleJsonParser,
    validateBody(publishScheduleSchema),
    async (req, res, next) => {
      try {
        res.json({
          data: await service.publish(
            req.params.weekStart,
            req.validatedBody,
            req.actor,
            req.requestId,
          ),
        });
      } catch (error) {
        next(error);
      }
    },
  );
  router.get(
    "/:weekStart/published",
    authenticate,
    createRequirePermission({
      authorizer,
      permission: PERMISSIONS.SCHEDULES_READ,
    }),
    async (req, res, next) => {
      try {
        res.json({
          data: await service.getPublished(req.params.weekStart, req.actor),
        });
      } catch (error) {
        next(error);
      }
    },
  );
  return router;
}
