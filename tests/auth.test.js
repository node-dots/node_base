import test from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import { readAuthenticationConfig } from "../src/config/authentication.js";
import { AccessTokenService } from "../src/modules/auth/accessTokens.js";
import { AuthService } from "../src/modules/auth/auth.service.js";
import {
  changePasswordInputSchema,
  loginInputSchema,
} from "../src/modules/auth/auth.schema.js";
import {
  bootstrapAdmin,
  readBootstrapAdminConfig,
} from "../src/modules/auth/bootstrapAdmin.js";
import { AUTH_ERROR_CODES } from "../src/modules/auth/auth.constants.js";

const jwtConfig = Object.freeze({
  secret: "a-private-test-secret-with-at-least-32-bytes",
  issuer: "https://kindergarten.example.test",
  audience: "kindergarten-api-tests",
});

test("authentication config requires a private secret and valid claims", () => {
  assert.throws(
    () =>
      readAuthenticationConfig({
        JWT_SECRET: "too-short",
        JWT_ISSUER: "https://kindergarten.example.test",
        JWT_AUDIENCE: "kindergarten-api",
      }),
    /JWT_SECRET/,
  );
  assert.deepEqual(
    readAuthenticationConfig({
      JWT_SECRET: jwtConfig.secret,
      JWT_ISSUER: jwtConfig.issuer,
      JWT_AUDIENCE: jwtConfig.audience,
      NODE_ENV: "test",
    }),
    jwtConfig,
  );
});

test("login and password schemas enforce bcrypt's UTF-8 byte boundary", () => {
  assert.equal(
    loginInputSchema.safeParse({
      email: "ADMIN@EXAMPLE.COM",
      password: "😀".repeat(18),
    }).success,
    true,
  );
  assert.equal(
    loginInputSchema.safeParse({
      email: "admin@example.com",
      password: "😀".repeat(19),
    }).success,
    false,
  );
  assert.equal(
    changePasswordInputSchema.safeParse({
      currentPassword: "current-secret",
      newPassword: "😀".repeat(19),
    }).success,
    false,
  );
  assert.equal(
    loginInputSchema.safeParse({
      email: "admin@example.com",
      password: "anything",
      roles: ["ADMIN"],
    }).success,
    false,
  );
});

test("access token enforces HS256, issuer, audience, subject, and 30-minute expiry", () => {
  let now = new Date("2026-10-24T12:00:00.000Z");
  const clock = { now: () => new Date(now) };
  const service = new AccessTokenService({ config: jwtConfig, clock });
  const token = service.issue({ subject: "person-1", tokenVersion: 3 });
  assert.deepEqual(service.verify(token), {
    subject: "person-1",
    tokenVersion: 3,
  });

  assert.throws(() => service.verify(`${token.slice(0, -1)}x`));
  const otherIssuer = jwt.sign({ tokenVersion: 3 }, jwtConfig.secret, {
    algorithm: "HS256",
    issuer: "https://other.example.test",
    audience: jwtConfig.audience,
    subject: "person-1",
    expiresIn: 1800,
  });
  assert.throws(() => service.verify(otherIssuer));
  const otherAudience = jwt.sign({ tokenVersion: 3 }, jwtConfig.secret, {
    algorithm: "HS256",
    issuer: jwtConfig.issuer,
    audience: "other-api",
    subject: "person-1",
    expiresIn: 1800,
  });
  assert.throws(() => service.verify(otherAudience));
  const wrongAlgorithm = jwt.sign({ tokenVersion: 3 }, jwtConfig.secret, {
    algorithm: "HS512",
    issuer: jwtConfig.issuer,
    audience: jwtConfig.audience,
    subject: "person-1",
    expiresIn: 1800,
  });
  assert.throws(() => service.verify(wrongAlgorithm));

  now = new Date("2026-10-24T12:30:01.000Z");
  assert.throws(() => service.verify(token));
});

test("login normalizes email and uses the same public failure for unknown or disabled accounts", async () => {
  const found = [];
  const tokenService = {
    issue: ({ subject, tokenVersion }) => `${subject}:${tokenVersion}`,
  };
  const authService = new AuthService({
    personRepository: {
      async findAccountByEmail(email) {
        found.push(email);
        if (email === "manager@example.com") {
          return {
            id: "person-1",
            account: {
              passwordHash: "password-hash",
              roles: ["MANAGER"],
              enabled: true,
              tokenVersion: 2,
            },
          };
        }
        if (email === "disabled@example.com") {
          return {
            id: "person-2",
            account: {
              passwordHash: "password-hash",
              roles: ["ADMIN"],
              enabled: false,
              tokenVersion: 0,
            },
          };
        }
        return null;
      },
    },
    tokenService,
    unitOfWork: {},
    hasher: {
      async compare(password, hash) {
        return password === "a-correct-password" && hash === "password-hash";
      },
    },
  });

  assert.deepEqual(
    await authService.login({
      email: " Manager@Example.com ",
      password: "a-correct-password",
    }),
    {
      accessToken: "person-1:2",
      tokenType: "Bearer",
      expiresIn: 1800,
    },
  );
  assert.equal(found[0], "manager@example.com");

  for (const credentials of [
    { email: "missing@example.com", password: "a-correct-password" },
    { email: "disabled@example.com", password: "a-correct-password" },
    { email: "manager@example.com", password: "wrong-password" },
  ]) {
    await assert.rejects(authService.login(credentials), (error) => {
      assert.equal(error.name, "AuthenticationError");
      assert.equal(error.code, AUTH_ERROR_CODES.INVALID_CREDENTIALS);
      return true;
    });
  }
});

test("authentication reads current enabled state and roles from the repository", async () => {
  let currentAccount = {
    id: "person-1",
    account: { enabled: true, roles: ["PARENT"], tokenVersion: 4 },
  };
  const authService = new AuthService({
    personRepository: {
      async findAccountById(id) {
        assert.equal(id, "person-1");
        return currentAccount;
      },
    },
    tokenService: { verify: () => ({ subject: "person-1", tokenVersion: 4 }) },
    unitOfWork: {},
  });

  assert.deepEqual(await authService.authenticate("signed-token"), {
    id: "person-1",
    roles: ["PARENT"],
  });
  currentAccount.account.roles = ["MANAGER"];
  assert.deepEqual(await authService.authenticate("signed-token"), {
    id: "person-1",
    roles: ["MANAGER"],
  });
  currentAccount.account.enabled = false;
  await assert.rejects(authService.authenticate("signed-token"), (error) => {
    assert.equal(error.name, "AuthenticationError");
    return true;
  });
  currentAccount.account.enabled = true;
  currentAccount.account.tokenVersion = 5;
  await assert.rejects(authService.authenticate("signed-token"), (error) => {
    assert.equal(error.name, "AuthenticationError");
    return true;
  });
});

test("bootstrap is idempotent and does not replace an existing admin password", async () => {
  const config = {
    BOOTSTRAP_ADMIN_EMAIL: "admin@example.com",
    BOOTSTRAP_ADMIN_PASSWORD: "first-password-long-enough",
    BOOTSTRAP_ADMIN_FIRST_NAME: "Ada",
    BOOTSTRAP_ADMIN_LAST_NAME: "Lovelace",
  };
  const stored = [];
  const repository = {
    async findFirstEnabledAdmin() {
      return (
        stored.find(
          (person) =>
            person.account.enabled && person.account.roles.includes("ADMIN"),
        ) ?? null
      );
    },
    async findAccountByEmail(email) {
      return stored.find((person) => person.account.email === email) ?? null;
    },
    async insert(person) {
      stored.push({ ...person, id: `person-${stored.length + 1}` });
    },
  };
  const hasher = {
    async hash(password) {
      return `hash:${password}`;
    },
  };

  assert.deepEqual(
    await bootstrapAdmin({ config, personRepository: repository, hasher }),
    {
      created: true,
    },
  );
  assert.deepEqual(
    await bootstrapAdmin({
      config: { ...config, BOOTSTRAP_ADMIN_PASSWORD: "different-password" },
      personRepository: repository,
      hasher,
    }),
    { created: false },
  );
  assert.equal(stored.length, 1);
  assert.equal(
    stored[0].account.passwordHash,
    "hash:first-password-long-enough",
  );
});

test("bootstrap configuration rejects missing/default or overlong bcrypt passwords", () => {
  assert.throws(() => readBootstrapAdminConfig({}), /BOOTSTRAP_ADMIN/);
  assert.throws(
    () =>
      readBootstrapAdminConfig({
        BOOTSTRAP_ADMIN_EMAIL: "admin@example.com",
        BOOTSTRAP_ADMIN_PASSWORD: "😀".repeat(19),
        BOOTSTRAP_ADMIN_FIRST_NAME: "Ada",
        BOOTSTRAP_ADMIN_LAST_NAME: "Lovelace",
      }),
    /BOOTSTRAP_ADMIN_PASSWORD/,
  );
});
