import { GroupService } from "./group.service.js";
import { GroupController } from "./group.controller.js";
import { createGroupRoutes } from "./group.routes.js";
import { GroupAccessPolicy } from "./groupAccessPolicy.js";
import { authorizer } from "../people/access/authorizer.js";
import { createAuthenticationMiddleware } from "../auth/auth.middleware.js";
import { createRequirePermission } from "../../middleware/requirePermission.js";
import { PERMISSIONS } from "../../utils/access/permissions.js";

// Місце складання DI: залежності передаємо через конструктори.
export class GroupModule {
  constructor({
    groupRepository,
    guardianGroupsReader,
    authService,
    catalogRepository,
    personRepository,
    childRepository,
    unitOfWork,
  }) {
    if (!authService) throw new TypeError("authService is required for groups");
    const accessPolicy = new GroupAccessPolicy({
      groupAssignmentsReader: groupRepository,
      guardianGroupsReader,
    });
    const groupService = new GroupService({
      groupRepository,
      authorizer,
      groupAccessPolicy: accessPolicy,
      catalogRepository,
      personRepository,
      childRepository,
      unitOfWork,
    });
    const groupController = new GroupController({ groupService });
    this.router = createGroupRoutes({
      groupController,
      authenticate: createAuthenticationMiddleware({ authService }),
      requireRead: createRequirePermission({
        authorizer,
        permission: PERMISSIONS.GROUPS_READ,
      }),
      requireCreate: createRequirePermission({
        authorizer,
        permission: PERMISSIONS.GROUPS_CREATE,
      }),
      requireUpdate: createRequirePermission({
        authorizer,
        permission: PERMISSIONS.GROUPS_UPDATE,
      }),
    });
  }
}
