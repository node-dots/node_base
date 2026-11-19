import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import mongoose from "mongoose";
import { CatalogModel } from "../../src/modules/catalog/catalog.model.js";
import { CatalogRepository } from "../../src/modules/catalog/catalog.repository.js";
import { ScheduleModel } from "../../src/modules/schedules/schedule.model.js";
import { ScheduleRepository } from "../../src/modules/schedules/schedule.repository.js";

test(
  "MongoDB: publication snapshot survives draft edits and shares the resource guard transaction",
  { skip: process.env.RUN_MONGO_TESTS !== "true" },
  async () => {
    const databaseName = `kindergarten_schedule_publish_${randomUUID().replaceAll("-", "")}`;
    const connection = await mongoose
      .createConnection(
        "mongodb://127.0.0.1:27017/?replicaSet=rs0&directConnection=true",
        { dbName: databaseName, serverSelectionTimeoutMS: 5000 },
      )
      .asPromise();
    try {
      const scheduleModel = connection.model("Schedule", ScheduleModel.schema);
      const catalogModel = connection.model("Catalog", CatalogModel.schema);
      await Promise.all([scheduleModel.init(), catalogModel.init()]);
      const schedules = new ScheduleRepository({ scheduleModel });
      const catalog = new CatalogRepository({ catalogModel });
      const weekStart = "2026-11-02";
      const actorId = "000000000000000000000001";
      const slot = {
        id: "lesson-1",
        groupId: "000000000000000000000002",
        roomId: "000000000000000000000003",
        teacherId: "000000000000000000000004",
        subjectCode: "LANGUAGE",
        weekday: 1,
        startTime: "09:00",
        endTime: "09:30",
      };

      await catalog.ensureScheduleResourceGuard();
      await schedules.updateDraft({
        weekStart,
        expectedRevision: 0,
        slots: [slot],
        updatedById: actorId,
      });
      await connection.transaction(async (session) => {
        const resource = await catalog.incrementScheduleResourceGuard({
          session,
        });
        const published = await schedules.publish({
          weekStart,
          expectedRevision: 1,
          session,
          published: {
            revision: 1,
            publishedAt: new Date("2026-10-26T12:00:00.000Z"),
            publishedById: actorId,
            resourceRevision: resource.revision,
            slots: [slot],
          },
        });
        assert.equal(published.published.resourceRevision, resource.revision);
      });

      const changedSlot = { ...slot, startTime: "10:00", endTime: "10:30" };
      const draft = await schedules.updateDraft({
        weekStart,
        expectedRevision: 1,
        slots: [changedSlot],
        updatedById: actorId,
      });
      assert.equal(draft.revision, 2);
      assert.equal(draft.slots[0].startTime, "10:00");
      const published = await schedules.findPublished(weekStart);
      assert.equal(published.published.revision, 1);
      assert.equal(published.published.slots[0].startTime, "09:00");
      assert.equal(published.published.resourceRevision, 1);
      assert.equal(
        (await catalog.findActiveByCode("SETTINGS", "SCHEDULE_RESOURCE_GUARD"))
          .revision,
        1,
      );
    } finally {
      try {
        await connection.dropDatabase();
      } finally {
        await connection.close();
      }
    }
  },
);
