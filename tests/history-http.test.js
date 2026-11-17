import test from "node:test";
import assert from "node:assert/strict";
import { Router } from "express";
import { createApp } from "../src/app.js";
import { createHistoryRoutes } from "../src/modules/history/history.routes.js";
import { HistoryService } from "../src/modules/history/history.service.js";
import { authorizer } from "../src/modules/people/access/authorizer.js";
import { createTestAuthModule, testAuthHeaders } from "./helpers/app.js";

function fixture(version) {
  return {
    id: `history-${version}`,
    entityType: "GROUP",
    entityId: "0123456789abcdef01234567",
    version,
    action: version === 1 ? "CREATE" : "UPDATE",
    changedAt: new Date("2026-11-16T12:00:00.000Z"),
    actorId: "000000000000000000000001",
    requestId: "request-1",
    correlationId: null,
    source: "API",
    reason: "POST /api/v1/groups",
    before: version === 1 ? null : { capacity: 10 },
    after: { capacity: version === 1 ? 10 : 12 },
    changedFields: ["capacity"],
  };
}

test("history HTTP API is read-only and ADMIN-only", async () => {
  const versions = [fixture(1), fixture(2)];
  const repository = {
    async list() {
      return { versions, total: versions.length };
    },
    async findVersion(entityType, entityId, version) {
      return versions.find((entry) => entry.version === version) ?? null;
    },
  };
  const authModule = createTestAuthModule();
  const router = Router();
  router.use(
    "/history",
    createHistoryRoutes({
      service: new HistoryService({
        historyRepository: repository,
        authorizer,
      }),
      authService: authModule.authService,
    }),
  );
  const server = createApp({ apiRouter: router }).listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}/api/v1/history`;
  try {
    assert.equal((await fetch(base)).status, 401);
    assert.equal(
      (await fetch(base, { headers: testAuthHeaders("test-manager") })).status,
      403,
    );
    const list = await fetch(`${base}?entityType=GROUP&page=1&pageSize=10`, {
      headers: testAuthHeaders(),
    });
    assert.equal(list.status, 200);
    assert.equal((await list.json()).data.versions.length, 2);
    const compare = await fetch(
      `${base}/GROUP/0123456789abcdef01234567/compare?fromVersion=1&toVersion=2`,
      { headers: testAuthHeaders() },
    );
    assert.equal(compare.status, 200);
    assert.deepEqual((await compare.json()).data.changedFields, ["capacity"]);
    assert.equal(
      (
        await fetch(`${base}/GROUP/0123456789abcdef01234567/versions/2`, {
          headers: testAuthHeaders(),
        })
      ).status,
      200,
    );
    assert.equal(
      (await fetch(base, { method: "DELETE", headers: testAuthHeaders() }))
        .status,
      404,
    );
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
