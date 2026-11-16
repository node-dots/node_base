import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import mongoose from "mongoose";
import { GroupModel } from "../../src/modules/groups/group.model.js";
import { PersonModel } from "../../src/modules/people/person.model.js";
import { withHistoryContext } from "../../src/modules/history/history.context.js";

test(
  "MongoDB: full snapshots are ordered, transactional, restorable and secret-safe",
  { skip: process.env.RUN_MONGO_TESTS !== "true" },
  async () => {
    const databaseName = `kindergarten_history_${randomUUID().replaceAll("-", "")}`;
    const connection = await mongoose
      .createConnection(
        "mongodb://127.0.0.1:27017/?replicaSet=rs0&directConnection=true",
        { dbName: databaseName, serverSelectionTimeoutMS: 5000 },
      )
      .asPromise();
    const Group = connection.model("Group", GroupModel.schema);
    const Person = connection.model("Person", PersonModel.schema);
    try {
      const groupId = new mongoose.Types.ObjectId();
      await withHistoryContext(
        {
          requestId: "history-create",
          actorId: "000000000000000000000001",
          source: "API",
          reason: "create group",
        },
        () =>
          connection.transaction(async (session) => {
            await Group.create(
              [
                {
                  _id: groupId,
                  name: "History Group",
                  ageCategory: 3,
                  capacity: 10,
                  status: "DRAFT",
                },
              ],
              { session },
            );
          }),
      );

      await withHistoryContext(
        { requestId: "history-update", source: "API" },
        () =>
          connection.transaction((session) =>
            Group.findByIdAndUpdate(
              groupId,
              { $set: { capacity: 12, status: "ACTIVE" } },
              { returnDocument: "after", runValidators: true, session },
            ).lean(),
          ),
      );
      const History = connection.model("EntityVersion");
      let versions = await History.find({
        entityType: "GROUP",
        entityId: groupId.toString(),
      })
        .sort({ version: 1 })
        .lean();
      assert.deepEqual(
        versions.map(({ version, action }) => ({ version, action })),
        [
          { version: 1, action: "CREATE" },
          { version: 2, action: "UPDATE" },
        ],
      );
      assert.equal(versions[0].after.capacity, 10);
      assert.equal(versions[1].before.capacity, 10);
      assert.equal(versions[1].after.capacity, 12);
      assert.deepEqual(versions[1].changedFields, ["capacity", "status"]);

      const rolledBackId = new mongoose.Types.ObjectId();
      await assert.rejects(
        withHistoryContext({ source: "SERVICE" }, () =>
          connection.transaction(async (session) => {
            await Group.create(
              [
                {
                  _id: rolledBackId,
                  name: "Rollback",
                  ageCategory: 2,
                  capacity: 5,
                  status: "DRAFT",
                },
              ],
              { session },
            );
            throw new Error("rollback");
          }),
        ),
        /rollback/,
      );
      assert.equal(await Group.exists({ _id: rolledBackId }), null);
      assert.equal(
        await History.countDocuments({ entityId: rolledBackId.toString() }),
        0,
      );

      let attempts = 0;
      await withHistoryContext({ source: "SERVICE", requestId: "retry" }, () =>
        connection.transaction(async (session) => {
          attempts += 1;
          await Group.findByIdAndUpdate(
            groupId,
            { $set: { capacity: 13 } },
            { returnDocument: "after", runValidators: true, session },
          );
          if (attempts === 1) {
            throw new mongoose.mongo.MongoServerError({
              message: "retry transaction",
              errorLabels: ["TransientTransactionError"],
            });
          }
        }),
      );
      assert.ok(attempts >= 2);
      assert.equal(
        await History.countDocuments({
          entityType: "GROUP",
          entityId: groupId.toString(),
          requestId: "retry",
        }),
        1,
      );

      const concurrentGroupId = new mongoose.Types.ObjectId();
      await withHistoryContext(
        { source: "SERVICE", requestId: "concurrent-create" },
        () =>
          connection.transaction((session) =>
            Group.create(
              [
                {
                  _id: concurrentGroupId,
                  name: "Concurrent Group",
                  ageCategory: 4,
                  capacity: 8,
                  status: "DRAFT",
                },
              ],
              { session },
            ),
          ),
      );
      await Promise.all(
        [9, 10, 11].map((capacity) =>
          withHistoryContext(
            {
              source: "SERVICE",
              requestId: `concurrent-${capacity}`,
            },
            () =>
              connection.transaction((session) =>
                Group.findByIdAndUpdate(
                  concurrentGroupId,
                  { $set: { capacity } },
                  { returnDocument: "after", runValidators: true, session },
                ),
              ),
          ),
        ),
      );
      const concurrentVersions = await History.find({
        entityType: "GROUP",
        entityId: concurrentGroupId.toString(),
      })
        .sort({ version: 1 })
        .lean();
      assert.deepEqual(
        concurrentVersions.map((entry) => entry.version),
        [1, 2, 3, 4],
      );
      assert.deepEqual(
        new Set(concurrentVersions.slice(1).map((entry) => entry.requestId)),
        new Set(["concurrent-9", "concurrent-10", "concurrent-11"]),
      );
      for (let index = 1; index < concurrentVersions.length; index += 1) {
        assert.equal(
          concurrentVersions[index].before.capacity,
          concurrentVersions[index - 1].after.capacity,
        );
      }

      const bulkIds = [
        new mongoose.Types.ObjectId(),
        new mongoose.Types.ObjectId(),
      ];
      await withHistoryContext(
        { source: "MIGRATION", requestId: "bulk-operations" },
        () =>
          connection.transaction(async (session) => {
            await Group.insertMany(
              bulkIds.map((_id, index) => ({
                _id,
                name: `Bulk ${index + 1}`,
                ageCategory: 5,
                capacity: 8,
                status: "DRAFT",
              })),
              { session },
            );
            await Group.updateMany(
              { _id: { $in: bulkIds } },
              { $set: { status: "INACTIVE" } },
              { runValidators: true, session },
            );
            await Group.deleteMany({ _id: { $in: bulkIds } }, { session });
          }),
      );
      for (const bulkId of bulkIds) {
        const bulkVersions = await History.find({
          entityType: "GROUP",
          entityId: bulkId.toString(),
        })
          .sort({ version: 1 })
          .lean();
        assert.deepEqual(
          bulkVersions.map(({ version, action }) => ({ version, action })),
          [
            { version: 1, action: "CREATE" },
            { version: 2, action: "UPDATE" },
            { version: 3, action: "DELETE" },
          ],
        );
      }

      await assert.rejects(
        History.updateOne(
          { entityType: "GROUP", entityId: groupId.toString(), version: 1 },
          { $set: { reason: "tampered" } },
        ),
        /append-only/,
      );

      const personId = new mongoose.Types.ObjectId();
      await withHistoryContext(
        { source: "SEED", requestId: "person-seed" },
        () =>
          connection.transaction(async (session) => {
            await Person.create(
              [
                {
                  _id: personId,
                  firstName: "History",
                  lastName: "Person",
                  status: "ACTIVE",
                  account: {
                    email: "history@example.test",
                    passwordHash: "must-never-appear",
                    roles: ["PARENT"],
                    enabled: true,
                    tokenVersion: 0,
                  },
                },
              ],
              { session },
            );
            await Person.findByIdAndUpdate(
              personId,
              {
                $set: {
                  "account.roles": ["PARENT", "EDUCATOR"],
                  employee: {
                    positionCode: "EDUCATOR",
                    status: "ACTIVE",
                    salaryMinor: 100000,
                    availability: [
                      { weekday: 1, startTime: "09:00", endTime: "17:00" },
                    ],
                  },
                },
              },
              { returnDocument: "after", runValidators: true, session },
            );
          }),
      );
      const personVersions = await History.find({
        entityType: "PERSON",
        entityId: personId.toString(),
      })
        .sort({ version: 1 })
        .lean();
      assert.equal(personVersions.length, 2);
      assert.equal(personVersions[0].after.account.passwordHash, "[REDACTED]");
      assert.doesNotMatch(JSON.stringify(personVersions), /must-never-appear/);
      assert.ok(personVersions[1].changedFields.includes("account.roles"));
      assert.ok(personVersions[1].changedFields.includes("employee"));

      await withHistoryContext({ source: "MIGRATION" }, () =>
        connection.transaction((session) =>
          Group.deleteOne({ _id: groupId }, { session }),
        ),
      );
      versions = await History.find({
        entityType: "GROUP",
        entityId: groupId.toString(),
      })
        .sort({ version: 1 })
        .lean();
      assert.equal(versions.at(-1).action, "DELETE");
      assert.equal(versions.at(-1).after, null);
      assert.equal(versions.at(-1).before.capacity, 13);
      assert.deepEqual(
        versions.map((entry) => entry.version),
        Array.from({ length: versions.length }, (_, index) => index + 1),
      );
    } finally {
      await connection.dropDatabase();
      await connection.close();
    }
  },
);
