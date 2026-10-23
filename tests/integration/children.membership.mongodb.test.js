import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import mongoose from "mongoose";
import { GroupModel } from "../../src/modules/groups/group.model.js";
import { GroupRepository } from "../../src/modules/groups/group.repository.js";
import { CatalogModel } from "../../src/modules/catalog/catalog.model.js";
import { CatalogRepository } from "../../src/modules/catalog/catalog.repository.js";
import {
  CATALOG_KIND,
  ROOM_TYPE,
} from "../../src/modules/catalog/catalog.constants.js";
import { PersonModel } from "../../src/modules/people/person.model.js";
import { ChildModel } from "../../src/modules/children/child.model.js";
import { ChildRepository } from "../../src/modules/children/child.repository.js";
import { ChildMembershipService } from "../../src/modules/children/childMembership.service.js";
import { AuditModel } from "../../src/modules/audit/audit.model.js";
import { AuditRepository } from "../../src/modules/audit/audit.repository.js";
import { AuditWriter } from "../../src/modules/audit/audit.writer.js";
import { UnitOfWork } from "../../src/workflows/unitOfWork.js";
import { createFixedClock } from "../../src/utils/calendar.js";
import { authorizer } from "../../src/modules/people/access/authorizer.js";

test(
  "MongoDB: only one simultaneous applicant claims the last seat and failed transfer rolls back both groups",
  { skip: process.env.RUN_MONGO_TESTS !== "true" },
  async () => {
    const databaseName = `kindergarten_test_${randomUUID().replaceAll("-", "")}`;
    const connection = await mongoose
      .createConnection(
        "mongodb://127.0.0.1:27017/?replicaSet=rs0&directConnection=true",
        { dbName: databaseName, serverSelectionTimeoutMS: 5000 },
      )
      .asPromise();
    try {
      const groupModel = connection.model("Group", GroupModel.schema);
      const catalogModel = connection.model("Catalog", CatalogModel.schema);
      const personModel = connection.model("Person", PersonModel.schema);
      const childModel = connection.model("Child", ChildModel.schema);
      const auditModel = connection.model("AuditLog", AuditModel.schema);
      await Promise.all([
        groupModel.init(),
        catalogModel.init(),
        personModel.init(),
        childModel.init(),
        auditModel.init(),
      ]);
      const [category, roomA, roomB] = await Promise.all([
        catalogModel.create({
          kind: CATALOG_KIND.AGE_CATEGORY,
          code: "AGE_4",
          name: "Age 4",
          active: true,
          age: 4,
        }),
        catalogModel.create({
          kind: CATALOG_KIND.ROOM,
          code: "GROUP_A",
          name: "A",
          active: true,
          roomType: ROOM_TYPE.GROUP,
          capacity: 2,
        }),
        catalogModel.create({
          kind: CATALOG_KIND.ROOM,
          code: "GROUP_B",
          name: "B",
          active: true,
          roomType: ROOM_TYPE.GROUP,
          capacity: 2,
        }),
      ]);
      const groups = await groupModel.create([
        {
          name: "A",
          ageCategory: 4,
          ageCategoryId: category._id,
          roomId: roomA._id,
          schoolYear: "2026-2027",
          capacity: 1,
          occupiedSeats: 0,
          status: "ACTIVE",
        },
        {
          name: "B",
          ageCategory: 4,
          ageCategoryId: category._id,
          roomId: roomB._id,
          schoolYear: "2026-2027",
          capacity: 1,
          occupiedSeats: 1,
          status: "ACTIVE",
        },
      ]);
      const children = await childModel.create(
        [1, 2, 3].map((n) => ({
          firstName: `Child${n}`,
          lastName: "Test",
          dateOfBirth: "2022-05-12",
          status: "APPLICANT",
          guardians: [
            { personId: new mongoose.Types.ObjectId(), relationship: "parent" },
          ],
        })),
      );
      await childModel.create({
        firstName: "Already",
        lastName: "Occupies",
        dateOfBirth: "2022-05-12",
        status: "ACTIVE",
        groupId: groups[1]._id,
        guardians: [
          { personId: new mongoose.Types.ObjectId(), relationship: "parent" },
        ],
        schoolYear: "2026-2027",
        ageCategoryId: category._id,
        billingStartMonth: "2026-11",
        enrolledAt: new Date(),
        membershipHistory: [{ groupId: groups[1]._id, startedAt: new Date() }],
      });
      const auditWriter = new AuditWriter({
        auditRepository: new AuditRepository({ auditModel }),
        clock: createFixedClock("2026-10-12T12:00:00Z"),
      });
      const service = new ChildMembershipService({
        childRepository: new ChildRepository({ childModel }),
        groupRepository: new GroupRepository({ groupModel }),
        catalogRepository: new CatalogRepository({ catalogModel }),
        authorizer,
        unitOfWork: new UnitOfWork({ connection, auditWriter }),
        clock: createFixedClock("2026-10-12T12:00:00Z"),
      });
      const actor = {
        id: new mongoose.Types.ObjectId().toString(),
        roles: ["ADMIN"],
      };
      const simultaneous = await Promise.allSettled(
        children
          .slice(0, 2)
          .map((child) =>
            service.enroll(
              child._id.toString(),
              groups[0]._id.toString(),
              actor,
              randomUUID(),
            ),
          ),
      );
      assert.equal(
        simultaneous.filter((result) => result.status === "fulfilled").length,
        1,
      );
      assert.equal(
        simultaneous.filter(
          (result) =>
            result.status === "rejected" &&
            result.reason.code === "GROUP_CAPACITY_FULL",
        ).length,
        1,
      );
      assert.equal(
        await groupModel
          .findById(groups[0]._id)
          .then((group) => group.occupiedSeats),
        1,
      );
      const enrolled = await childModel
        .findOne({ groupId: groups[0]._id })
        .lean();
      await assert.rejects(
        () =>
          service.transfer(
            enrolled._id.toString(),
            groups[1]._id.toString(),
            actor,
            randomUUID(),
          ),
        { code: "GROUP_CAPACITY_FULL" },
      );
      assert.equal(
        (await childModel.findById(enrolled._id).lean()).groupId.toString(),
        groups[0]._id.toString(),
      );
      assert.equal(
        await groupModel
          .findById(groups[0]._id)
          .then((group) => group.occupiedSeats),
        1,
      );
      assert.equal(
        await groupModel
          .findById(groups[1]._id)
          .then((group) => group.occupiedSeats),
        1,
      );
    } finally {
      await connection.dropDatabase();
      await connection.close();
    }
  },
);
