import test from "node:test";
import assert from "node:assert/strict";
import {
  AuditWriter,
  sanitizeAuditSnapshot,
} from "../src/modules/audit/audit.writer.js";
import { UnitOfWork } from "../src/workflows/unitOfWork.js";
import { createFixedClock } from "../src/utils/calendar.js";

test("audit writer stores only explicitly selected safe snapshot fields", async () => {
  let inserted;
  const session = {};
  const writer = new AuditWriter({
    auditRepository: {
      async insert(entry, options) {
        inserted = { entry, options };
      },
    },
    clock: createFixedClock("2026-10-24T12:00:00.000Z"),
  });

  await writer.record(
    {
      actorId: "account-1",
      requestId: "request-1",
      action: "GROUP_UPDATED",
      entityType: "GROUP",
      entityId: "group-1",
      safeFields: ["name", "status"],
      before: {
        name: "Sunflowers",
        status: "DRAFT",
        passwordHash: "must-not-be-recorded",
      },
      after: { name: "Sunflowers", status: "ACTIVE" },
    },
    { session },
  );

  assert.deepEqual(inserted.entry.before, {
    name: "Sunflowers",
    status: "DRAFT",
  });
  assert.deepEqual(inserted.entry.after, {
    name: "Sunflowers",
    status: "ACTIVE",
  });
  assert.equal(
    inserted.entry.occurredAt.toISOString(),
    "2026-10-24T12:00:00.000Z",
  );
  assert.equal(inserted.options.session, session);
  assert.equal(Object.hasOwn(inserted.entry.before, "passwordHash"), false);
});

test("audit snapshot rejects sensitive allowlist fields and nested payloads", () => {
  assert.throws(
    () =>
      sanitizeAuditSnapshot(
        { passwordHash: "hash" },
        new Set(["passwordHash"]),
      ),
    /sensitive audit snapshot field/,
  );
  assert.throws(
    () =>
      sanitizeAuditSnapshot({ profile: { name: "Ada" } }, new Set(["profile"])),
    /not a safe scalar/,
  );
});

test("unit of work runs only the committed attempt's after-commit callbacks", async () => {
  const session = {
    attempts: 0,
    async withTransaction(callback) {
      this.attempts += 1;
      await callback();
      if (this.attempts === 1) await callback();
    },
    async endSession() {},
  };
  const connection = {
    async startSession() {
      return session;
    },
  };
  const auditWriter = {
    async record(_event, options) {
      assert.equal(options.session, session);
    },
  };
  const unitOfWork = new UnitOfWork({ connection, auditWriter });
  let externalEffects = 0;
  let operationCalls = 0;

  const result = await unitOfWork.execute(async ({ afterCommit }) => {
    operationCalls += 1;
    afterCommit(async () => {
      externalEffects += 1;
    });
    return "committed";
  });

  assert.equal(operationCalls, 2);
  assert.equal(externalEffects, 1);
  assert.equal(result, "committed");
});

test("unit of work does not run external callbacks when the transaction fails", async () => {
  const session = {
    async withTransaction(callback) {
      await callback();
      throw new Error("abort");
    },
    async endSession() {},
  };
  const unitOfWork = new UnitOfWork({
    connection: {
      async startSession() {
        return session;
      },
    },
    auditWriter: { async record() {} },
  });
  let externalEffects = 0;

  await assert.rejects(
    unitOfWork.execute(async ({ afterCommit }) => {
      afterCommit(async () => {
        externalEffects += 1;
      });
    }),
    /abort/,
  );
  assert.equal(externalEffects, 0);
});
