import { GroupService } from "./group.service.js";
import { GroupController } from "./group.controller.js";
import { createGroupRoutes } from "./group.routes.js";

// Місце складання DI: залежності передаємо через конструктори.
export class GroupModule {
  constructor({ groupRepository }) {
    const groupService = new GroupService({ groupRepository });
    const groupController = new GroupController({ groupService });
    this.router = createGroupRoutes({ groupController });
  }
}
