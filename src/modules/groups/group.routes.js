import { Router } from "express";
import { validateBody } from "../../middleware/validateBody.js";
import { createGroupSchema, groupListQuerySchema } from "./group.schema.js";
import { validateQuery } from "../../middleware/validateQuery.js";

export function createGroupRoutes({
  groupController,
  authenticate,
  requireRead,
  requireCreate,
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

  return router;
}
