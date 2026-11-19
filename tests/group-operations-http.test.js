import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { createGroupRoutes } from "../src/modules/groups/group.routes.js";

const groupId = "507f1f77bcf86cd799439011";
const resources = {
  schoolYear: "2026-2027",
  ageCategoryId: "507f1f77bcf86cd799439012",
  roomId: "507f1f77bcf86cd799439013",
  educatorId: "507f1f77bcf86cd799439014",
  assistantId: "507f1f77bcf86cd799439015",
  capacity: 16,
};

const pass = (_request, _response, next) => next();
const groupController = {
  list() {},
  summary() {},
  get() {},
  create() {},
};

function routeDependencies(groupService) {
  return {
    groupController,
    groupService,
    authenticate(request, _response, next) {
      request.actor = { id: "admin-1", roles: ["ADMIN"] };
      request.requestId = "request-1";
      next();
    },
    requireRead: pass,
    requireCreate: pass,
    requireUpdate: pass,
  };
}

async function withServer(groupService, run) {
  const app = express();
  app.use(express.json());
  app.use("/api/v1/groups", createGroupRoutes(routeDependencies(groupService)));
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  try {
    await run(`http://127.0.0.1:${server.address().port}/api/v1/groups`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test("group routes fail fast when groupService is not injected", () => {
  assert.throws(
    () => createGroupRoutes(routeDependencies()),
    /groupService is required for group routes/,
  );
});

test("all group operation endpoints call the injected group service", async () => {
  const calls = [];
  const result = (operation) => ({ id: groupId, operation });
  const groupService = {
    async updateResources(id, input, actor, requestId) {
      calls.push({ method: "updateResources", id, input, actor, requestId });
      return result("resources");
    },
    async updateCapacity(id, capacity, actor, requestId) {
      calls.push({ method: "updateCapacity", id, capacity, actor, requestId });
      return result("capacity");
    },
    async deactivate(id, actor, requestId) {
      calls.push({ method: "deactivate", id, actor, requestId });
      return result("deactivate");
    },
    async transferToNextSchoolYear(id, actor, requestId) {
      calls.push({
        method: "transferToNextSchoolYear",
        id,
        actor,
        requestId,
      });
      return result("transfer-next-year");
    },
  };

  await withServer(groupService, async (baseUrl) => {
    const requests = [
      {
        method: "PUT",
        path: "/resources",
        body: resources,
        operation: "resources",
      },
      {
        method: "PATCH",
        path: "/capacity",
        body: { capacity: 17 },
        operation: "capacity",
      },
      { method: "POST", path: "/deactivate", operation: "deactivate" },
      {
        method: "POST",
        path: "/transfer-next-year",
        operation: "transfer-next-year",
      },
    ];

    for (const request of requests) {
      const response = await fetch(`${baseUrl}/${groupId}${request.path}`, {
        method: request.method,
        headers: request.body
          ? { "Content-Type": "application/json" }
          : undefined,
        body: request.body ? JSON.stringify(request.body) : undefined,
      });
      assert.equal(response.status, 200, request.path);
      assert.equal((await response.json()).data.operation, request.operation);
    }
  });

  assert.deepEqual(
    calls.map(({ method }) => method),
    [
      "updateResources",
      "updateCapacity",
      "deactivate",
      "transferToNextSchoolYear",
    ],
  );
  assert.equal(calls[0].id, groupId);
  assert.deepEqual(calls[0].input, resources);
  assert.equal(calls[1].capacity, 17);
  for (const call of calls) {
    assert.deepEqual(call.actor, { id: "admin-1", roles: ["ADMIN"] });
    assert.equal(call.requestId, "request-1");
  }
});
