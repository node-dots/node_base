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
import { EmployeeService } from "./people/employee.service.js";
import { createEmployeeRoutes } from "./people/employee.routes.js";

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
    catalogRepository: settingsRepository,
    personRepository: authModule?.personRepository,
    childRepository: guardianGroupsReader,
    unitOfWork: authModule?.unitOfWork,
  });

  router.use("/groups", groupModule.router);
  if (authModule) {
    router.use("/auth", authModule.router ?? authModule);
    if (authModule.personRepository && authModule.unitOfWork) {
      const employeeService = new EmployeeService({
        personRepository: authModule.personRepository,
        catalogRepository: settingsRepository,
        groupRepository,
        unitOfWork: authModule.unitOfWork,
        authorizer,
      });
      router.use(
        "/people",
        createEmployeeRoutes({
          employeeService,
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
