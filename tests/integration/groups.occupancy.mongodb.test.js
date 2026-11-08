import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import mongoose from "mongoose";
import { GroupModel } from "../../src/modules/groups/group.model.js";
import { GroupRepository } from "../../src/modules/groups/group.repository.js";
import { ChildModel } from "../../src/modules/children/child.model.js";

test(
  "MongoDB: occupancy retains empty groups, counts ACTIVE/SUSPENDED only, exposes mismatches, and scopes totals",
  { skip: process.env.RUN_MONGO_TESTS !== "true" },
  async () => {
    const connection = await mongoose
      .createConnection(
        "mongodb://127.0.0.1:27017/?replicaSet=rs0&directConnection=true",
        {
          dbName: `group_occupancy_${randomUUID().replaceAll("-", "")}`,
          serverSelectionTimeoutMS: 5000,
        },
      )
      .asPromise();
    try {
      const groups = connection.model("Group", GroupModel.schema);
      const children = connection.model("Child", ChildModel.schema);
      await Promise.all([groups.init(), children.init()]);
      const [empty, occupied, hidden] = await groups.create([
        {
          name: "Empty",
          ageCategory: 3,
          capacity: 2,
          status: "ACTIVE",
          schoolYear: "2026-2027",
          occupiedSeats: 0,
        },
        {
          name: "Occupied",
          ageCategory: 3,
          capacity: 3,
          status: "ACTIVE",
          schoolYear: "2026-2027",
          occupiedSeats: 2,
        },
        {
          name: "Other year",
          ageCategory: 4,
          capacity: 2,
          status: "ACTIVE",
          schoolYear: "2025-2026",
          occupiedSeats: 0,
        },
      ]);
      const guardianId = new mongoose.Types.ObjectId();
      await children.create([
        {
          firstName: "Active",
          lastName: "One",
          dateOfBirth: "2022-01-01",
          status: "ACTIVE",
          groupId: occupied._id,
          guardians: [{ personId: guardianId, relationship: "parent" }],
        },
        {
          firstName: "Suspended",
          lastName: "Two",
          dateOfBirth: "2022-02-01",
          status: "SUSPENDED",
          groupId: occupied._id,
        },
        {
          firstName: "Applicant",
          lastName: "Three",
          dateOfBirth: "2022-03-01",
          status: "APPLICANT",
        },
        {
          firstName: "Left",
          lastName: "Four",
          dateOfBirth: "2022-04-01",
          status: "LEFT",
        },
      ]);
      const repository = new GroupRepository({ groupModel: groups });
      const result = await repository.findOccupancyPage({
        page: 1,
        pageSize: 20,
        scope: {
          kind: "RELATED",
          groupIds: [empty._id.toString(), occupied._id.toString()],
        },
        schoolYear: "2026-2027",
        status: "ACTIVE",
      });
      assert.equal(result.total, 2);
      const emptyDto = result.groups.find((g) => g.id === empty._id.toString());
      const occupiedDto = result.groups.find(
        (g) => g.id === occupied._id.toString(),
      );
      assert.equal(emptyDto.currentOccupied, 0);
      assert.equal(emptyDto.freePlaces, 2);
      assert.equal(emptyDto.occupancyMismatch, false);
      assert.equal(occupiedDto.currentOccupied, 2);
      assert.equal(occupiedDto.occupancyMismatch, false);
      await groups.updateOne(
        { _id: occupied._id },
        { $set: { occupiedSeats: 1 } },
      );
      const mismatch = await repository.findOccupancyPage({
        page: 1,
        pageSize: 1,
        scope: { kind: "RELATED", groupIds: [occupied._id.toString()] },
      });
      assert.equal(mismatch.total, 1);
      assert.equal(mismatch.groups[0].occupancyMismatch, true);
      assert.equal(mismatch.groups[0].occupiedSeats, 1);
      const summary = await repository.summarizeOccupancyByAge({
        scope: { kind: "RELATED", groupIds: [occupied._id.toString()] },
      });
      assert.equal(summary[0].currentOccupied, 2);
      assert.equal(summary[0].storedOccupied, 1);
      assert.equal(summary[0].mismatchGroups, 1);
      const denied = await repository.findOccupancyPage({
        page: 1,
        pageSize: 10,
        scope: { kind: "RELATED", groupIds: [] },
      });
      assert.equal(denied.total, 0);
      assert.equal(denied.groups.length, 0);
      assert.ok(hidden);
    } finally {
      await connection.dropDatabase();
      await connection.close();
    }
  },
);
