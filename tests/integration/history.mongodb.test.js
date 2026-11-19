import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import mongoose from "mongoose";
import { GroupModel } from "../../src/modules/groups/group.model.js";
import { PersonModel } from "../../src/modules/people/person.model.js";
import { ChildModel } from "../../src/modules/children/child.model.js";
import { CatalogModel } from "../../src/modules/catalog/catalog.model.js";
import { InvoiceModel } from "../../src/modules/invoices/invoice.model.js";
import { PaymentModel } from "../../src/modules/payments/payment.model.js";
import { RefundModel } from "../../src/modules/payments/refund.model.js";
import { ExpenseModel } from "../../src/modules/expenses/expense.model.js";
import { ScheduleModel } from "../../src/modules/schedules/schedule.model.js";
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

      await withHistoryContext(
        { requestId: "history-no-op", source: "API" },
        () =>
          connection.transaction((session) =>
            Group.findByIdAndUpdate(
              groupId,
              { $set: { capacity: 12, status: "ACTIVE" } },
              { returnDocument: "after", runValidators: true, session },
            ).lean(),
          ),
      );
      assert.equal(
        await History.countDocuments({
          entityType: "GROUP",
          entityId: groupId.toString(),
        }),
        2,
      );

      await withHistoryContext(
        { requestId: "history-replace", source: "MIGRATION" },
        () =>
          connection.transaction((session) =>
            Group.replaceOne(
              { _id: groupId },
              {
                name: "History Group",
                ageCategory: 3,
                capacity: 14,
                status: "ACTIVE",
                occupiedSeats: 0,
              },
              { runValidators: true, session },
            ),
          ),
      );
      const replaced = await History.findOne({
        entityType: "GROUP",
        entityId: groupId.toString(),
        version: 3,
      }).lean();
      assert.equal(replaced.before.capacity, 12);
      assert.equal(replaced.after.capacity, 14);
      assert.deepEqual(replaced.changedFields, ["capacity"]);

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
      await assert.rejects(
        History.bulkWrite([
          {
            deleteOne: {
              filter: {
                entityType: "GROUP",
                entityId: groupId.toString(),
                version: 1,
              },
            },
          },
        ]),
        /append-only/,
      );
      await assert.rejects(
        Group.bulkWrite([
          {
            updateOne: {
              filter: { _id: groupId },
              update: { $set: { capacity: 15 } },
            },
          },
        ]),
        /bulkWrite is disabled/,
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
      assert.equal(personVersions[0].after.account.tokenVersion, 0);
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

test(
  "MongoDB: every persistent business model records its normal writes",
  { skip: process.env.RUN_MONGO_TESTS !== "true" },
  async () => {
    const databaseName = `kindergarten_history_coverage_${randomUUID().replaceAll("-", "")}`;
    const connection = await mongoose
      .createConnection(
        "mongodb://127.0.0.1:27017/?replicaSet=rs0&directConnection=true",
        { dbName: databaseName, serverSelectionTimeoutMS: 5000 },
      )
      .asPromise();
    const models = {
      GROUP: connection.model("Group", GroupModel.schema),
      CHILD: connection.model("Child", ChildModel.schema),
      PERSON: connection.model("Person", PersonModel.schema),
      CATALOG: connection.model("Catalog", CatalogModel.schema),
      INVOICE: connection.model("Invoice", InvoiceModel.schema),
      PAYMENT: connection.model("Payment", PaymentModel.schema),
      REFUND: connection.model("Refund", RefundModel.schema),
      EXPENSE: connection.model("Expense", ExpenseModel.schema),
      SCHEDULE: connection.model("Schedule", ScheduleModel.schema),
    };
    const ids = Object.fromEntries(
      Object.keys(models).map((entityType) => [
        entityType,
        new mongoose.Types.ObjectId(),
      ]),
    );
    const references = {
      child: new mongoose.Types.ObjectId(),
      invoice: new mongoose.Types.ObjectId(),
      payment: new mongoose.Types.ObjectId(),
      person: new mongoose.Types.ObjectId(),
    };

    try {
      await withHistoryContext(
        { source: "SERVICE", requestId: "all-models-create" },
        async () => {
          await models.GROUP.create([
            {
              _id: ids.GROUP,
              name: "Coverage Group",
              ageCategory: 3,
              capacity: 10,
              status: "DRAFT",
            },
          ]);
          await models.CHILD.create([
            {
              _id: ids.CHILD,
              firstName: "History",
              lastName: "Child",
              dateOfBirth: "2022-05-20",
              status: "APPLICANT",
              food: { preferences: [], exclusions: [], allergyNotes: [] },
            },
          ]);
          await models.PERSON.create([
            {
              _id: ids.PERSON,
              firstName: "History",
              lastName: "Owner",
              status: "ACTIVE",
            },
          ]);
          await models.CATALOG.create([
            {
              _id: ids.CATALOG,
              kind: "AGE_CATEGORY",
              code: "HISTORY_AGE_3",
              name: "History age three",
              active: true,
              age: 3,
            },
          ]);
          await models.INVOICE.create([
            {
              _id: ids.INVOICE,
              childId: references.child,
              service: "TUITION",
              serviceMonth: "2026-11",
              billingType: "MONTHLY",
              status: "OPEN",
              origAmountCents: 100_000,
              remainingAmountCents: 100_000,
              tariffSnapshot: {
                code: "TUITION",
                effectiveFrom: "2026-09-01",
                amountCents: 100_000,
              },
              formula: "100000",
              dueAt: new Date("2026-11-10T21:00:00.000Z"),
              parts: [
                {
                  month: "2026-11",
                  amountCents: 100_000,
                  remainingCents: 100_000,
                },
              ],
            },
          ]);
          await models.PAYMENT.create([
            {
              _id: ids.PAYMENT,
              invoiceId: references.invoice,
              amountCents: 50_000,
              method: "BANK_TRANSFER",
              status: "PENDING",
              payerPersonId: references.person,
              actorId: references.person,
              idempotencyKey: "history-payment",
              payloadHash: "a".repeat(64),
              reportedAt: new Date("2026-11-05T09:00:00.000Z"),
            },
          ]);
          await models.REFUND.create([
            {
              _id: ids.REFUND,
              paymentId: references.payment,
              invoiceId: references.invoice,
              childId: references.child,
              actorId: references.person,
              amountCents: 10_000,
              reason: "History coverage",
              idempotencyKey: "history-refund",
              payloadHash: "b".repeat(64),
              status: "CONFIRMED",
              recordedAt: new Date("2026-11-06T09:00:00.000Z"),
            },
          ]);
          await models.EXPENSE.create([
            {
              _id: ids.EXPENSE,
              category: "OTHER",
              amountCents: 25_000,
              serviceMonth: "2026-11",
              reason: "History coverage",
              status: "DRAFT",
            },
          ]);
          await models.SCHEDULE.create([
            {
              _id: ids.SCHEDULE,
              weekStart: "2026-11-16",
              revision: 1,
              slots: [],
              updatedById: references.person,
            },
          ]);
        },
      );

      await withHistoryContext(
        { source: "SERVICE", requestId: "all-models-update" },
        async () => {
          const options = { returnDocument: "after", runValidators: true };
          await models.GROUP.findByIdAndUpdate(
            ids.GROUP,
            { $set: { capacity: 11 } },
            options,
          );
          await models.CHILD.findByIdAndUpdate(
            ids.CHILD,
            { $set: { "food.preferences": ["NO_SUGAR"] } },
            options,
          );
          await models.PERSON.findByIdAndUpdate(
            ids.PERSON,
            { $set: { phone: "+380000000000" } },
            options,
          );
          await models.CATALOG.findByIdAndUpdate(
            ids.CATALOG,
            { $set: { name: "Updated history age three" } },
            options,
          );
          await models.INVOICE.findByIdAndUpdate(
            ids.INVOICE,
            {
              $set: {
                status: "PARTIAL",
                remainingAmountCents: 50_000,
                "parts.0.remainingCents": 50_000,
              },
            },
            options,
          );
          await models.PAYMENT.findByIdAndUpdate(
            ids.PAYMENT,
            {
              $set: {
                status: "CONFIRMED",
                occurredAt: new Date("2026-11-05T10:00:00.000Z"),
                confirmedAt: new Date("2026-11-05T10:00:00.000Z"),
              },
            },
            options,
          );
          await models.EXPENSE.findByIdAndUpdate(
            ids.EXPENSE,
            {
              $set: {
                status: "APPROVED",
                snapshot: { approvedAmountCents: 25_000 },
              },
            },
            options,
          );
          await models.SCHEDULE.findByIdAndUpdate(
            ids.SCHEDULE,
            { $set: { revision: 2, slots: [] } },
            options,
          );
        },
      );

      const History = connection.model("EntityVersion");
      const expectedCounts = {
        GROUP: 2,
        CHILD: 2,
        PERSON: 2,
        CATALOG: 2,
        INVOICE: 2,
        PAYMENT: 2,
        REFUND: 1,
        EXPENSE: 2,
        SCHEDULE: 2,
      };
      for (const [entityType, expectedCount] of Object.entries(
        expectedCounts,
      )) {
        const versions = await History.find({
          entityType,
          entityId: ids[entityType].toString(),
        })
          .sort({ version: 1 })
          .lean();
        assert.equal(versions.length, expectedCount, entityType);
        assert.deepEqual(
          versions.map((entry) => entry.version),
          Array.from({ length: expectedCount }, (_, index) => index + 1),
          entityType,
        );
        assert.equal(versions[0].action, "CREATE", entityType);
        if (expectedCount === 2) {
          assert.equal(versions[1].action, "UPDATE", entityType);
          assert.notDeepEqual(
            versions[1].before,
            versions[1].after,
            entityType,
          );
        }
      }
    } finally {
      await connection.dropDatabase();
      await connection.close();
    }
  },
);
