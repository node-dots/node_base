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
import { ChildService } from "./children/child.service.js";
import { createChildRoutes } from "./children/child.routes.js";
import { PersonModel } from "./people/person.model.js";
import { PersonRepository } from "./people/person.repository.js";

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
      const childRepository = new ChildRepository({ childModel: ChildModel });
      const childService = new ChildService({
        childRepository,
        personRepository:
          authModule.personRepository ??
          new PersonRepository({ personModel: PersonModel }),
        groupAssignmentsReader: groupRepository,
        authorizer,
        unitOfWork: authModule.unitOfWork,
      });
      router.use(
        "/children",
        createChildRoutes({
          childService,
          authService: authModule.authService,
        }),
      );
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
