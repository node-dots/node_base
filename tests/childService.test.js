import test from "node:test";
import assert from "node:assert/strict";
import { ChildService } from "../src/modules/children/child.service.js";
import { authorizer } from "../src/modules/people/access/authorizer.js";
import { ROLES } from "../src/utils/access/roles.js";
import { Router } from "express";
import { createApp } from "../src/app.js";
import { createChildRoutes } from "../src/modules/children/child.routes.js";
import { createTestAuthModule, testAuthHeaders } from "./helpers/app.js";

const childId = "507f1f77bcf86cd799439011";
const parentId = "507f1f77bcf86cd799439012";
const child = {
  id: childId,
  firstName: "A",
  lastName: "B",
  dateOfBirth: "2020-01-01",
  status: "APPLICANT",
  guardians: [{ personId: parentId, relationship: "parent" }],
  relatives: [],
  food: { preferences: [], exclusions: [], allergyNotes: [] },
};
function service(overrides = {}) {
  const childRepository = {
    findByIdInScope: async () => structuredClone(child),
    updateProfileByIdInScope: async (_id, update) => ({
      ...structuredClone(child),
      ...structuredClone(update),
    }),
    findPageInScope: async () => ({
      children: [structuredClone(child)],
      total: 1,
    }),
    ...overrides.childRepository,
  };
  const unitOfWork = {
    execute: async (operation) =>
      operation({ session: {}, recordAudit: async () => {} }),
  };
  return new ChildService({
    childRepository,
    personRepository: {
      findById: async (id) =>
        id === parentId ? { id, status: "ACTIVE" } : null,
    },
    groupAssignmentsReader: { findActiveGroupIds: async () => [] },
    authorizer,
    unitOfWork,
  });
}

test("parent can update own child's nutrition only and gets 404 for unrelated child", async () => {
  const svc = service();
  const parent = { id: parentId, roles: [ROLES.PARENT] };
  const result = await svc.update(
    childId,
    { food: { exclusions: ["x"] } },
    parent,
    "request-1",
  );
  assert.deepEqual(result.food.exclusions, ["x"]);
  await assert.rejects(
    () => svc.update(childId, { guardians: [] }, parent, "request-2"),
    { code: "FIELD_UPDATE_FORBIDDEN" },
  );
  const unrelated = service({
    childRepository: { findByIdInScope: async () => null },
  });
  await assert.rejects(() => unrelated.get(childId, parent), {
    code: "CHILD_NOT_FOUND",
  });
});

test("administrative update rejects status and groupId while validating guardian references", async () => {
  const svc = service();
  const admin = { id: "507f1f77bcf86cd799439013", roles: [ROLES.ADMIN] };
  await assert.rejects(() =>
    svc.update(childId, { status: "ACTIVE" }, admin, "r"),
  );
  await assert.rejects(() =>
    svc.update(
      childId,
      {
        guardians: [
          { personId: "507f1f77bcf86cd799439099", relationship: "parent" },
        ],
      },
      admin,
      "r",
    ),
  );
});

test("missing actor is denied on direct service calls", async () => {
  await assert.rejects(() => service().get(childId, undefined));
});

test("children HTTP routes require authentication and reject managed fields", async () => {
  let updateCalls = 0;
  const auth = createTestAuthModule();
  const api = Router();
  api.use(
    "/children",
    createChildRoutes({
      authService: auth.authService,
      childService: {
        async list() {
          return {
            children: [],
            pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
          };
        },
        async createApplicant() {
          return { ...child };
        },
        async get() {
          return { ...child };
        },
        async update() {
          updateCalls += 1;
          return { ...child };
        },
      },
    }),
  );
  const server = createApp({ apiRouter: api }).listen(0, "127.0.0.1");
  await new Promise((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  const baseUrl = `http://127.0.0.1:${server.address().port}/api/v1/children`;
  try {
    assert.equal((await fetch(baseUrl)).status, 401);
    const response = await fetch(`${baseUrl}/${childId}`, {
      method: "PATCH",
      headers: { ...testAuthHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ status: "ACTIVE" }),
    });
    assert.equal(response.status, 400);
    assert.equal(updateCalls, 0);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
