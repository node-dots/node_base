import { Router } from "express";
import { validateBody } from "../../middleware/validateBody.js";
import { createGroupSchema, groupListQuerySchema } from "./group.schema.js";
import { validateQuery } from "../../middleware/validateQuery.js";
import { validateParams } from "../../middleware/validateParams.js";
import { groupIdParamsSchema } from "./group.schema.js";
import {
  groupResourcesSchema,
  updateGroupCapacitySchema,
} from "./groupResources.schema.js";

export function createGroupRoutes({
  groupController,
  authenticate,
  requireRead,
  requireCreate,
  requireUpdate,
}) {
  const router = Router();

  router.get(
    "/",
    authenticate,
    requireRead,
    validateQuery(groupListQuerySchema),
    groupController.list.bind(groupController),
  );
  router.get(
    "/summary",
    authenticate,
    requireRead,
    groupController.summary.bind(groupController),
  );
  router.get(
    "/:id",
    authenticate,
    requireRead,
    groupController.get.bind(groupController),
  );
  router.post(
    "/",
    authenticate,
    requireCreate,
    validateBody(createGroupSchema),
    groupController.create.bind(groupController),
  );

  router.put(
    "/:id/resources",
    authenticate,
    requireUpdate,
    validateParams(groupIdParamsSchema),
    validateBody(groupResourcesSchema),
    async (request, response, next) => {
      try {
        response.json({
          data: await groupService.updateResources(
            request.validatedParams.id,
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
  router.patch(
    "/:id/capacity",
    authenticate,
    requireUpdate,
    validateParams(groupIdParamsSchema),
    validateBody(updateGroupCapacitySchema),
    async (request, response, next) => {
      try {
        response.json({
          data: await groupService.updateCapacity(
            request.validatedParams.id,
            request.validatedBody.capacity,
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
    "/:id/deactivate",
    authenticate,
    requireUpdate,
    validateParams(groupIdParamsSchema),
    async (request, response, next) => {
      try {
        response.json({
          data: await groupService.deactivate(
            request.validatedParams.id,
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
    "/:id/transfer-next-year",
    authenticate,
    requireUpdate,
    validateParams(groupIdParamsSchema),
    async (request, response, next) => {
      try {
        response.json({
          data: await groupService.transferToNextSchoolYear(
            request.validatedParams.id,
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
