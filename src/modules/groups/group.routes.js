import { Router } from "express";
import { validateBody } from "../../middleware/validateBody.js";
import { createGroupSchema, groupListQuerySchema } from "./group.schema.js";
import { validateQuery } from "../../middleware/validateQuery.js";

export function createGroupRoutes({ groupController }) {
  const router = Router();

  router.get(
    "/",
    validateQuery(groupListQuerySchema),
    groupController.list.bind(groupController),
  );
  router.get("/summary", groupController.summary.bind(groupController));
  router.get("/:id", groupController.get.bind(groupController));
  router.post(
    "/",
    validateBody(createGroupSchema),
    groupController.create.bind(groupController),
  );

  return router;
}
