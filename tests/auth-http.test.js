import test from "node:test";
import assert from "node:assert/strict";
import { createAuthRoutes } from "../src/modules/auth/auth.routes.js";
import { AuthController } from "../src/modules/auth/auth.controller.js";
import { createTestApp } from "./helpers/app.js";
import { createSecurityMiddleware } from "../src/middleware/security.js";
import { readSecurityConfig } from "../src/config/security.js";
import { SECURITY_DEFAULTS } from "../src/config/securityDefaults.js";

async function withServer(app, run) {
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  try {
    await run(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
}

function buildAuthRouter(
  authService,
  loginRateLimiter = (_request, _response, next) => next(),
) {
  const authController = new AuthController({ authService });
  return createAuthRoutes({ authService, authController, loginRateLimiter });
}

test("auth routes return only the token at login and current database actor on protected requests", async () => {
  const authService = {
    async login() {
      return {
        accessToken: "signed-access-token",
        tokenType: "Bearer",
        expiresIn: 1800,
      };
    },
    async authenticate(token) {
      if (token !== "signed-access-token") {
        const error = new Error("unauthorized");
        error.status = 401;
        error.code = "AUTHENTICATION_REQUIRED";
        throw error;
      }
      return { id: "person-1", roles: ["ADMIN"] };
    },
    async changePassword() {},
    async logoutAll() {},
  };
  const app = createTestApp({ authModule: buildAuthRouter(authService) });

  await withServer(app, async (origin) => {
    const login = await fetch(`${origin}/api/v1/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: "admin@example.com",
        password: "valid-password",
      }),
    });
    assert.equal(login.status, 200);
    assert.deepEqual(await login.json(), {
      data: {
        accessToken: "signed-access-token",
        tokenType: "Bearer",
        expiresIn: 1800,
      },
    });

    const missing = await fetch(`${origin}/api/v1/auth/me`);
    assert.equal(missing.status, 401);

    const current = await fetch(`${origin}/api/v1/auth/me`, {
      headers: { authorization: "Bearer signed-access-token" },
    });
    assert.equal(current.status, 200);
    assert.deepEqual(await current.json(), {
      data: { id: "person-1", roles: ["ADMIN"] },
    });
  });
});

test("login rejects extra fields and its dedicated per-IP limit blocks the next attempt", async () => {
  let loginCalls = 0;
  const authService = {
    async login() {
      loginCalls += 1;
      return { accessToken: "token", tokenType: "Bearer", expiresIn: 1800 };
    },
    async authenticate() {
      return { id: "person-1", roles: ["ADMIN"] };
    },
  };
  const securityConfig = readSecurityConfig({
    LOGIN_RATE_LIMIT_REQUESTS: "2",
    LOGIN_RATE_LIMIT_WINDOW_MS: "900000",
  });
  const limiter = createSecurityMiddleware(securityConfig).loginRateLimiter;
  const app = createTestApp({
    authModule: buildAuthRouter(authService, limiter),
  });

  assert.equal(SECURITY_DEFAULTS.LOGIN_RATE_LIMIT_REQUESTS, 10);
  assert.equal(SECURITY_DEFAULTS.LOGIN_RATE_LIMIT_WINDOW_MS, 900_000);

  await withServer(app, async (origin) => {
    const invalid = await fetch(`${origin}/api/v1/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: "admin@example.com",
        password: "long-password",
        roles: ["ADMIN"],
      }),
    });
    assert.equal(invalid.status, 400);
    assert.equal(loginCalls, 0);

    const allowed = await fetch(`${origin}/api/v1/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: "admin@example.com",
        password: "valid-password",
      }),
    });
    assert.equal(allowed.status, 200);

    const limited = await fetch(`${origin}/api/v1/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: "admin@example.com",
        password: "valid-password",
      }),
    });
    assert.equal(limited.status, 429);
    assert.ok(limited.headers.get("retry-after"));
    assert.equal(loginCalls, 1);
  });
});
