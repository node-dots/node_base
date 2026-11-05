import { Router } from "express";
import { GroupModel } from "./groups/group.model.js";
import { GroupRepository } from "./groups/group.repository.js";
import { GroupModule } from "./groups/group.module.js";
import { ChildModel } from "./children/child.model.js";
import { ChildRepository } from "./children/child.repository.js";
import { CatalogModel } from "./catalog/catalog.model.js";
import { CatalogRepository } from "./catalog/catalog.repository.js";
import { AccountRolesService } from "./people/accountRoles.service.js";
import { createAccountRolesRoutes } from "./people/accountRoles.routes.js";
import { authorizer } from "./people/access/authorizer.js";

// Єдине місце реєстрації бізнес-модулів і складання їхніх залежностей.
export function createApiRouter({
  groupRepository = new GroupRepository({ groupModel: GroupModel }),
  guardianGroupsReader = new ChildRepository({ childModel: ChildModel }),
  settingsRepository = new CatalogRepository({ catalogModel: CatalogModel }),
  authModule,
} = {}) {
  const router = Router();
  const groupModule = new GroupModule({
    groupRepository,
    guardianGroupsReader,
    authService: authModule?.authService,
  });

  router.use("/groups", groupModule.router);
  if (authModule) {
    router.use("/auth", authModule.router ?? authModule);
    if (authModule.personRepository && authModule.unitOfWork) {
      const accountRolesService = new AccountRolesService({
        authorizer,
        personRepository: authModule.personRepository,
        settingsRepository,
        unitOfWork: authModule.unitOfWork,
      });
      router.use(
        "/people",
        createAccountRolesRoutes({
          accountRolesService,
          authService: authModule.authService,
        }),
      );
    }
  }
  return router;
}
