import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import mongoose from "mongoose";
import { ScheduleModel } from "../../src/modules/schedules/schedule.model.js";
import { ScheduleRepository } from "../../src/modules/schedules/schedule.repository.js";

test(
  "MongoDB: concurrent first draft edits cannot overwrite the same revision",
  { skip: process.env.RUN_MONGO_TESTS !== "true" },
  async () => {
    const databaseName = `kindergarten_schedules_${randomUUID().replaceAll("-", "")}`;
    const connection = await mongoose
      .createConnection(
        "mongodb://127.0.0.1:27017/?replicaSet=rs0&directConnection=true",
        { dbName: databaseName, serverSelectionTimeoutMS: 5000 },
      )
      .asPromise();
    try {
      const scheduleModel = connection.model("Schedule", ScheduleModel.schema);
      await scheduleModel.init();
      const repository = new ScheduleRepository({ scheduleModel });
      const weekStart = "2026-11-02";
      const actorId = "000000000000000000000001";
      const edits = await Promise.allSettled([
        repository.updateDraft({
          weekStart,
          expectedRevision: 0,
          slots: [],
          updatedById: actorId,
        }),
        repository.updateDraft({
          weekStart,
          expectedRevision: 0,
          slots: [],
          updatedById: actorId,
        }),
      ]);
      assert.equal(
        edits.filter(({ status }) => status === "fulfilled").length,
        1,
      );
      assert.equal(
        edits.filter(
          ({ status, reason }) =>
            status === "rejected" && reason.code === 11000,
        ).length,
        1,
      );
      const draft = await repository.findDraft(weekStart);
      assert.equal(draft.revision, 1);
      assert.deepEqual(draft.slots, []);
    } finally {
      await connection.dropDatabase();
      await connection.close();
    }
  },
);
