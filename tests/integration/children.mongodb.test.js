import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import mongoose from "mongoose";
import { ChildModel } from "../../src/modules/children/child.model.js";
import { ChildRepository } from "../../src/modules/children/child.repository.js";
import { prepareApplicant } from "../../src/modules/children/child.rules.js";
import { createFixedClock } from "../../src/utils/calendar.js";
import {
  CHILD_LIMITS,
  CHILD_STATUS,
} from "../../src/modules/children/child.constants.js";

test(
  "MongoDB: applicant round-trip, дублікати та захист керованих полів",
  { skip: process.env.RUN_MONGO_TESTS !== "true" },
  async () => {
    const databaseName = `kindergarten_children_${randomUUID().replaceAll("-", "")}`;
    const connection = await mongoose
      .createConnection(
        "mongodb://127.0.0.1:27017/?replicaSet=rs0&directConnection=true",
        { dbName: databaseName, serverSelectionTimeoutMS: 5000 },
      )
      .asPromise();

    try {
      const model = connection.model("Child", ChildModel.schema);
      await model.init();
      const repository = new ChildRepository({ childModel: model });
      const input = {
        firstName: "Марія",
        lastName: "Коваль",
        dateOfBirth: "2022-05-12",
        guardians: [
          {
            personId: new mongoose.Types.ObjectId().toString(),
            relationship: "мати",
          },
        ],
        relatives: [
          { name: "Олег", relationship: "дядько", contact: "+380000000000" },
        ],
        food: { preferences: ["яблуко"], allergyNotes: ["горіхи"] },
      };
      const prepared = prepareApplicant(input, {
        clock: createFixedClock("2026-10-22T12:00:00Z"),
      });

      const first = await repository.insertApplicant(prepared);
      const second = await repository.insertApplicant(prepared);
      assert.notEqual(first.id, second.id);
      assert.deepEqual(await repository.findById(first.id), first);
      assert.equal(first.status, CHILD_STATUS.APPLICANT);
      assert.equal(first.guardians[0].personId, input.guardians[0].personId);

      const updated = await repository.updateProfileById(first.id, {
        food: { preferences: ["груша"], exclusions: [], allergyNotes: [] },
      });
      assert.deepEqual(updated.food.preferences, ["груша"]);
      assert.equal(updated.status, CHILD_STATUS.APPLICANT);

      await assert.rejects(
        repository.updateProfileById(first.id, { status: CHILD_STATUS.ACTIVE }),
        /profile fields/,
      );

      const excessiveHistory = Array.from(
        { length: CHILD_LIMITS.MAX_MEMBERSHIP_HISTORY + 1 },
        () => ({
          groupId: new mongoose.Types.ObjectId(),
          startedAt: new Date(),
        }),
      );
      await assert.rejects(
        model.create({ ...prepared, membershipHistory: excessiveHistory }),
        /membershipHistory/,
      );

      await assert.rejects(
        model.create({ ...prepared, status: CHILD_STATUS.ACTIVE }),
        /groupId/,
      );
      await assert.rejects(
        model.create({
          ...prepared,
          groupId: new mongoose.Types.ObjectId(),
        }),
        /groupId/,
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
