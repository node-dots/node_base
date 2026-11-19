import { Router } from "express";
import { createApp } from "../../src/app.js";
import { createApiRouter } from "../../src/modules/index.js";
import { InMemoryGroupRepository } from "./groupRepository.js";
import { buildGroupDraft } from "../../src/modules/groups/group.service.js";
import { AuthenticationError } from "../../src/utils/errors.js";

const TEST_ACTORS = Object.freeze({
  "test-admin": { id: "000000000000000000000001", roles: ["ADMIN"] },
  "test-manager": { id: "000000000000000000000002", roles: ["MANAGER"] },
  "test-parent": { id: "000000000000000000000003", roles: ["PARENT"] },
  "test-teacher": { id: "000000000000000000000004", roles: ["TEACHER"] },
});

export function testAuthHeaders(token = "test-admin") {
  return { Authorization: `Bearer ${token}` };
}

export function createTestAuthModule() {
  return {
    router: Router(),
    authService: {
      async authenticate(token) {
        const actor = TEST_ACTORS[token];
        if (!actor) {
          throw new AuthenticationError(
            "AUTHENTICATION_REQUIRED",
            "Потрібна автентифікація",
          );
        }
        return structuredClone(actor);
      },
    },
  };
}

// Кожен тест явно отримує власний репозиторій; production не має fallback.
export function createTestApp(options = {}) {
  const {
    groupRepository = new InMemoryGroupRepository([
      buildGroupDraft({ name: "Сонечка", ageCategory: 2, capacity: 20 }),
      buildGroupDraft({ name: "Зірочки", ageCategory: 3, capacity: 20 }),
    ]),
    guardianGroupsReader = {
      async findActiveGroupIds() {
        return [];
      },
    },
    settingsRepository,
    authModule = createTestAuthModule(),
    ...appOptions
  } = options;
  const fallbackAuth = createTestAuthModule();
  const effectiveAuthModule = authModule?.authService
    ? authModule
    : { router: authModule, authService: fallbackAuth.authService };
  return createApp({
    apiRouter: createApiRouter({
      groupRepository,
      guardianGroupsReader,
      settingsRepository,
      authModule: effectiveAuthModule,
    }),
    ...appOptions,
  });
}
