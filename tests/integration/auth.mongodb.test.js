import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import mongoose from "mongoose";
import { createFixedClock } from "../../src/utils/calendar.js";
import { AuditModel } from "../../src/modules/audit/audit.model.js";
import { AuditRepository } from "../../src/modules/audit/audit.repository.js";
import { AuditWriter } from "../../src/modules/audit/audit.writer.js";
import { AccessTokenService } from "../../src/modules/auth/accessTokens.js";
import { AuthService } from "../../src/modules/auth/auth.service.js";
import {
  bootstrapAdmin,
  readBootstrapAdminConfig,
} from "../../src/modules/auth/bootstrapAdmin.js";
import { PersonModel } from "../../src/modules/people/person.model.js";
import { PersonRepository } from "../../src/modules/people/person.repository.js";
import { UnitOfWork } from "../../src/workflows/unitOfWork.js";

test(
  "MongoDB: bootstrap is idempotent and password/logout-all changes revoke JWTs atomically with audit",
  { skip: process.env.RUN_MONGO_TESTS !== "true" },
  async () => {
    const connection = await mongoose
      .createConnection(
        "mongodb://127.0.0.1:27017/?replicaSet=rs0&directConnection=true",
        {
          dbName: `kindergarten_test_${randomUUID().replaceAll("-", "")}`,
          serverSelectionTimeoutMS: 5000,
        },
      )
      .asPromise();

    try {
      const personModel = connection.model("Person", PersonModel.schema);
      const auditModel = connection.model("AuditLog", AuditModel.schema);
      await Promise.all([personModel.init(), auditModel.init()]);
      const personRepository = new PersonRepository({ personModel });
      const auditRepository = new AuditRepository({ auditModel });
      const clock = createFixedClock("2026-10-24T12:00:00.000Z");
      const auditWriter = new AuditWriter({ auditRepository, clock });
      const unitOfWork = new UnitOfWork({ connection, auditWriter });
      const tokenService = new AccessTokenService({
        config: {
          secret: "private-test-token-secret-with-more-than-32-bytes",
          issuer: "https://kindergarten.example.test",
          audience: "kindergarten-api-tests",
        },
        clock,
      });
      const authService = new AuthService({
        personRepository,
        tokenService,
        unitOfWork,
      });
      const bootstrapConfig = readBootstrapAdminConfig({
        BOOTSTRAP_ADMIN_EMAIL: "ADMIN@EXAMPLE.COM",
        BOOTSTRAP_ADMIN_PASSWORD: "initial-admin-password",
        BOOTSTRAP_ADMIN_FIRST_NAME: "Ada",
        BOOTSTRAP_ADMIN_LAST_NAME: "Lovelace",
      });

      assert.deepEqual(
        await bootstrapAdmin({ config: bootstrapConfig, personRepository }),
        { created: true },
      );
      const firstAdmin =
        await personRepository.findAccountByEmail("admin@example.com");
      const originalHash = firstAdmin.account.passwordHash;
      assert.deepEqual(
        await bootstrapAdmin({
          config: {
            ...bootstrapConfig,
            BOOTSTRAP_ADMIN_PASSWORD: "replacement-password",
          },
          personRepository,
        }),
        { created: false },
      );
      assert.equal(
        (await personRepository.findAccountByEmail("admin@example.com")).account
          .passwordHash,
        originalHash,
      );
      assert.equal(await personModel.countDocuments(), 1);

      const firstLogin = await authService.login({
        email: "admin@example.com",
        password: "initial-admin-password",
      });
      const actor = await authService.authenticate(firstLogin.accessToken);
      assert.deepEqual(actor.roles, ["ADMIN"]);

      await authService.logoutAll(actor, "request-logout");
      await assert.rejects(
        authService.authenticate(firstLogin.accessToken),
        /автентифікація/,
      );

      const secondLogin = await authService.login({
        email: "admin@example.com",
        password: "initial-admin-password",
      });
      const actorAfterLogout = await authService.authenticate(
        secondLogin.accessToken,
      );
      await authService.changePassword(
        actorAfterLogout,
        {
          currentPassword: "initial-admin-password",
          newPassword: "replacement-admin-password",
        },
        "request-password",
      );
      await assert.rejects(
        authService.authenticate(secondLogin.accessToken),
        /автентифікація/,
      );

      const thirdLogin = await authService.login({
        email: "admin@example.com",
        password: "replacement-admin-password",
      });
      assert.equal(
        (await authService.authenticate(thirdLogin.accessToken)).id,
        actor.id,
      );

      const auditRecords = await auditModel.find().sort({ action: 1 }).lean();
      assert.deepEqual(auditRecords.map((record) => record.action).sort(), [
        "PASSWORD_CHANGED",
        "SESSIONS_REVOKED",
      ]);
      const serializedAudit = JSON.stringify(auditRecords);
      assert.equal(serializedAudit.includes("initial-admin-password"), false);
      assert.equal(
        serializedAudit.includes("replacement-admin-password"),
        false,
      );
      assert.equal(serializedAudit.includes(originalHash), false);
    } finally {
      try {
        await connection.dropDatabase();
      } finally {
        await connection.close();
      }
    }
  },
);
