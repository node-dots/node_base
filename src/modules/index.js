import { Router } from "express";
import { GroupModel } from "./groups/group.model.js";
import { GroupRepository } from "./groups/group.repository.js";
import { GroupModule } from "./groups/group.module.js";

// Єдине місце реєстрації бізнес-модулів і складання їхніх залежностей.
export function createApiRouter({
  groupRepository = new GroupRepository({ groupModel: GroupModel }),
  authModule,
} = {}) {
  const router = Router();
  const groupModule = new GroupModule({ groupRepository });

  router.use("/groups", groupModule.router);
  if (authModule) router.use("/auth", authModule.router ?? authModule);
  return router;
}
