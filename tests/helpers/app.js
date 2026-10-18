import { createApp } from "../../src/app.js";
import { createApiRouter } from "../../src/modules/index.js";
import { InMemoryGroupRepository } from "./groupRepository.js";
import { buildGroupDraft } from "../../src/modules/groups/group.service.js";

// Кожен тест явно отримує власний репозиторій; production не має fallback.
export function createTestApp(options = {}) {
  const {
    groupRepository = new InMemoryGroupRepository([
      buildGroupDraft({ name: "Сонечка", ageCategory: 2, capacity: 20 }),
      buildGroupDraft({ name: "Зірочки", ageCategory: 3, capacity: 20 }),
    ]),
    ...appOptions
  } = options;
  return createApp({
    apiRouter: createApiRouter({ groupRepository }),
    ...appOptions,
  });
}
