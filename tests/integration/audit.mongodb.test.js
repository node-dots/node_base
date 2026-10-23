import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import mongoose from "mongoose";
import { AuditModel } from "../../src/modules/audit/audit.model.js";
import { AuditRepository } from "../../src/modules/audit/audit.repository.js";
import { AuditWriter } from "../../src/modules/audit/audit.writer.js";
import { GroupModel } from "../../src/modules/groups/group.model.js";
import { createFixedClock } from "../../src/utils/calendar.js";
import { UnitOfWork } from "../../src/workflows/unitOfWork.js";

const mongoUri =
  "mongodb://127.0.0.1:27017/?replicaSet=rs0&directConnection=true";

async function withTestDatabase(run) {
  const connection = await mongoose
    .createConnection(mongoUri, {
      dbName: `kindergarten_test_${randomUUID().replaceAll("-", "")}`,
      serverSelectionTimeoutMS: 5000,
    })
    .asPromise();

  try {
    const groupModel = connection.model("Group", GroupModel.schema);
    const auditModel = connection.model("AuditLog", AuditModel.schema);
    await Promise.all([groupModel.init(), auditModel.init()]);
    const auditRepository = new AuditRepository({ auditModel });
    const auditWriter = new AuditWriter({
      auditRepository,
      clock: createFixedClock("2026-10-24T12:00:00.000Z"),
    });
    const unitOfWork = new UnitOfWork({ connection, auditWriter });
    await run({ connection, groupModel, auditModel, unitOfWork });
  } finally {
    try {
      await connection.dropDatabase();
    } finally {
      await connection.close();
    }
  }
}

test(
  "MongoDB: business update and audit record commit atomically with one session",
  { skip: process.env.RUN_MONGO_TESTS !== "true" },
  async () => {
    await withTestDatabase(async ({ groupModel, auditModel, unitOfWork }) => {
      const group = await groupModel.create({
        name: "Sunflowers",
        ageCategory: 3,
        capacity: 18,
        status: "DRAFT",
      });

      let externalEffects = 0;
      await unitOfWork.execute(
        async ({ session, recordAudit, afterCommit }) => {
          await groupModel.updateOne(
            { _id: group._id },
            { $set: { status: "ACTIVE" } },
            { session },
          );
          await recordAudit({
            actorId: "account-1",
            requestId: "request-1",
            action: "GROUP_ACTIVATED",
            entityType: "GROUP",
            entityId: group._id.toString(),
            safeFields: ["name", "status"],
            before: { name: "Sunflowers", status: "DRAFT" },
            after: {
              name: "Sunflowers",
              status: "ACTIVE",
              passwordHash: "omit",
            },
          });
          afterCommit(async () => {
            externalEffects += 1;
          });
        },
      );

      assert.equal(
        (await groupModel.findById(group._id).lean()).status,
        "ACTIVE",
      );
      const [audit] = await auditModel.find().lean();
      assert.equal(audit.action, "GROUP_ACTIVATED");
      assert.equal(audit.after.status, "ACTIVE");
      assert.equal(Object.hasOwn(audit.after, "passwordHash"), false);
      assert.equal(audit.occurredAt.toISOString(), "2026-10-24T12:00:00.000Z");
      assert.equal(externalEffects, 1);
    });
  },
);

test(
  "MongoDB: a failed second business write rolls back the first write",
  { skip: process.env.RUN_MONGO_TESTS !== "true" },
  async () => {
    await withTestDatabase(async ({ groupModel, auditModel, unitOfWork }) => {
      const group = await groupModel.create({
        name: "Sunflowers",
        ageCategory: 3,
        capacity: 18,
        status: "DRAFT",
      });

      await assert.rejects(
        unitOfWork.execute(async ({ session }) => {
          await groupModel.updateOne(
            { _id: group._id },
            { $set: { status: "ACTIVE" } },
            { session },
          );
          throw new Error("second business write failed");
        }),
        /second business write failed/,
      );

      assert.equal(
        (await groupModel.findById(group._id).lean()).status,
        "DRAFT",
      );
      assert.equal(await auditModel.countDocuments(), 0);
    });
  },
);

test(
  "MongoDB: an audit insert failure rolls back the business update",
  { skip: process.env.RUN_MONGO_TESTS !== "true" },
  async () => {
    await withTestDatabase(async ({ groupModel, auditModel, unitOfWork }) => {
      const group = await groupModel.create({
        name: "Sunflowers",
        ageCategory: 3,
        capacity: 18,
        status: "DRAFT",
      });
      const failingUnitOfWork = new UnitOfWork({
        connection: unitOfWork.connection,
        auditWriter: {
          async record(_event, { session }) {
            assert.ok(session);
            throw new Error("audit insert failed");
          },
        },
      });

      await assert.rejects(
        failingUnitOfWork.execute(async ({ session, recordAudit }) => {
          await groupModel.updateOne(
            { _id: group._id },
            { $set: { status: "ACTIVE" } },
            { session },
          );
          await recordAudit({
            actorId: "account-1",
            requestId: "request-2",
            action: "GROUP_ACTIVATED",
            entityType: "GROUP",
            entityId: group._id.toString(),
          });
        }),
        /audit insert failed/,
      );

      assert.equal(
        (await groupModel.findById(group._id).lean()).status,
        "DRAFT",
      );
      assert.equal(await auditModel.countDocuments(), 0);
    });
  },
);
