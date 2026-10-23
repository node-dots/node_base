import test from "node:test";
import assert from "node:assert/strict";
import {
  createTestApp,
  createTestAuthModule,
  testAuthHeaders,
} from "./helpers/app.js";
import { HTTP_STATUS } from "../src/utils/httpConstants.js";

test("account roles endpoint authenticates, authorizes, validates, and returns audited change", async () => {
  const id = "000000000000000000000010";
  const account = {
    id,
    account: { roles: ["MANAGER"], enabled: true, tokenVersion: 1 },
  };
  let recorded;
  const authModule = createTestAuthModule();
  authModule.personRepository = {
    async findAccountById() {
      return structuredClone(account);
    },
    async countEnabledAdmins() {
      return 2;
    },
    async updateAccountRoles({ roles }) {
      account.account.roles = [...roles];
      account.account.tokenVersion += 1;
      return structuredClone(account);
    },
  };
  authModule.unitOfWork = {
    async execute(operation) {
      return operation({
        session: {},
        recordAudit: async (event) => {
          recorded = event;
        },
      });
    },
  };
  const server = createTestApp({
    authModule,
    settingsRepository: {
      async ensureAdminGuard() {},
      async incrementAdminGuard() {},
    },
  }).listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const url = `http://127.0.0.1:${server.address().port}/api/v1/people/${id}/account/roles`;
  try {
    assert.equal(
      (
        await fetch(url, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ roles: ["PARENT"] }),
        })
      ).status,
      HTTP_STATUS.UNAUTHORIZED,
    );
    assert.equal(
      (
        await fetch(url, {
          method: "PUT",
          headers: {
            ...testAuthHeaders("test-manager"),
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ roles: ["PARENT"] }),
        })
      ).status,
      HTTP_STATUS.FORBIDDEN,
    );
    const invalid = await fetch(url, {
      method: "PUT",
      headers: { ...testAuthHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ roles: ["ROOT"] }),
    });
    assert.equal(invalid.status, HTTP_STATUS.BAD_REQUEST);

    const response = await fetch(url, {
      method: "PUT",
      headers: { ...testAuthHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ roles: ["PARENT"] }),
    });
    assert.equal(response.status, HTTP_STATUS.OK);
    assert.deepEqual((await response.json()).data, {
      personId: id,
      roles: ["PARENT"],
    });
    assert.equal(recorded.action, "account.roles.assign");
    assert.equal(recorded.entityId, id);
    assert.deepEqual(recorded.before, { roles: ["MANAGER"] });
    assert.deepEqual(recorded.after, { roles: ["PARENT"] });
    assert.ok(recorded.requestId);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
