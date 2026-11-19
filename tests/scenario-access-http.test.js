import test from "node:test";
import assert from "node:assert/strict";
import { createTestApp } from "./helpers/app.js";
import { createHttpServer } from "../src/utils/createHttpServer.js";
import { readSecurityConfig } from "../src/config/security.js";

test("scenario endpoints require authentication and deny manager/parent over HTTP", async () => {
  const securityConfig = readSecurityConfig({});
  const server = createHttpServer({
    app: createTestApp({ securityConfig }),
    securityConfig,
  });
  server.listen(0, "127.0.0.1");
  await new Promise((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });

  try {
    const baseUrl = `http://127.0.0.1:${server.address().port}/api/v1/finance/scenarios`;
    for (const path of ["/forecast", "/compare-configurations"]) {
      const unauthenticated = await fetch(`${baseUrl}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      assert.equal(unauthenticated.status, 401, path);

      for (const actorToken of ["test-manager", "test-parent"]) {
        const denied = await fetch(`${baseUrl}${path}`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${actorToken}`,
            "Content-Type": "application/json",
          },
          body: "{}",
        });
        assert.equal(denied.status, 403, `${actorToken} ${path}`);
      }
    }

    const adminPassesAuthorization = await fetch(`${baseUrl}/forecast`, {
      method: "POST",
      headers: {
        Authorization: "Bearer test-admin",
        "Content-Type": "application/json",
      },
      body: "{}",
    });
    assert.equal(adminPassesAuthorization.status, 400);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
