import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import mongoose from "mongoose";
import { GroupModel } from "../../src/modules/groups/group.model.js";
import { GroupRepository } from "../../src/modules/groups/group.repository.js";
import { GroupService } from "../../src/modules/groups/group.service.js";
import { CatalogModel } from "../../src/modules/catalog/catalog.model.js";
import { CatalogRepository } from "../../src/modules/catalog/catalog.repository.js";
import {
  CATALOG_KIND,
  ROOM_TYPE,
} from "../../src/modules/catalog/catalog.constants.js";
import { PersonModel } from "../../src/modules/people/person.model.js";
import { PersonRepository } from "../../src/modules/people/person.repository.js";
import { ChildModel } from "../../src/modules/children/child.model.js";
import { ChildRepository } from "../../src/modules/children/child.repository.js";
import { AuditModel } from "../../src/modules/audit/audit.model.js";
import { AuditRepository } from "../../src/modules/audit/audit.repository.js";
import { AuditWriter } from "../../src/modules/audit/audit.writer.js";
import { UnitOfWork } from "../../src/workflows/unitOfWork.js";
import { systemClock } from "../../src/utils/calendar.js";
import { authorizer } from "../../src/modules/people/access/authorizer.js";

test(
  "MongoDB: shared resource guard permits only one concurrent room reservation and detects cross-role assignments",
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
      const auditModel = connection.model("Audit", AuditModel.schema);
      await Promise.all([
        groupModel.init(),
        catalogModel.init(),
        personModel.init(),
        childModel.init(),
        auditModel.init(),
      ]);
      const [
        category,
        roomA,
        roomB,
        educatorA,
        assistantA,
        educatorB,
        assistantB,
      ] = await Promise.all([
        catalogModel.create({
          kind: CATALOG_KIND.AGE_CATEGORY,
          code: "AGE_3",
          name: "Age 3",
          active: true,
          age: 3,
        }),
        catalogModel.create({
          kind: CATALOG_KIND.ROOM,
          code: "ROOM_A",
          name: "Room A",
          active: true,
          roomType: ROOM_TYPE.GROUP,
          capacity: 20,
        }),
        catalogModel.create({
          kind: CATALOG_KIND.ROOM,
          code: "ROOM_B",
          name: "Room B",
          active: true,
          roomType: ROOM_TYPE.GROUP,
          capacity: 20,
        }),
        personModel.create({
          firstName: "E1",
          lastName: "Staff",
          status: "ACTIVE",
          employee: {
            positionCode: "EDUCATOR",
            status: "ACTIVE",
            salaryMinor: 1,
            startedAt: "2024-01-01",
            availability: [],
          },
        }),
        personModel.create({
          firstName: "A1",
          lastName: "Staff",
          status: "ACTIVE",
          employee: {
            positionCode: "ASSISTANT",
            status: "ACTIVE",
            salaryMinor: 1,
            startedAt: "2024-01-01",
            availability: [],
          },
        }),
        personModel.create({
          firstName: "E2",
          lastName: "Staff",
          status: "ACTIVE",
          employee: {
            positionCode: "EDUCATOR",
            status: "ACTIVE",
            salaryMinor: 1,
            startedAt: "2024-01-01",
            availability: [],
          },
        }),
        personModel.create({
          firstName: "A2",
          lastName: "Staff",
          status: "ACTIVE",
          employee: {
            positionCode: "ASSISTANT",
            status: "ACTIVE",
            salaryMinor: 1,
            startedAt: "2024-01-01",
            availability: [],
          },
        }),
      ]);
      const groups = await groupModel.create([
        { name: "One", ageCategory: 3, capacity: 18, status: "DRAFT" },
        { name: "Two", ageCategory: 3, capacity: 18, status: "DRAFT" },
      ]);
      const catalogRepository = new CatalogRepository({ catalogModel });
      const personRepository = new PersonRepository({ personModel });
      const groupRepository = new GroupRepository({ groupModel });
      const unitOfWork = new UnitOfWork({
        connection,
        auditWriter: new AuditWriter({
          auditRepository: new AuditRepository({ auditModel }),
          clock: systemClock,
        }),
      });
      const service = new GroupService({
        groupRepository,
        authorizer,
        groupAccessPolicy: {},
        catalogRepository,
        personRepository,
        childRepository: new ChildRepository({ childModel }),
        unitOfWork,
      });
      const actor = { id: educatorA._id.toString(), roles: ["ADMIN"] };
      const makeInput = (roomId, educatorId, assistantId) => ({
        schoolYear: "2026-2027",
        ageCategoryId: category._id.toString(),
        roomId: roomId.toString(),
        educatorId: educatorId._id.toString(),
        assistantId: assistantId._id.toString(),
        capacity: 18,
      });
      const concurrent = await Promise.allSettled([
        service.updateResources(
          groups[0]._id.toString(),
          makeInput(roomA._id, educatorA, assistantA),
          actor,
          randomUUID(),
        ),
        service.updateResources(
          groups[1]._id.toString(),
          makeInput(roomA._id, educatorB, assistantB),
          actor,
          randomUUID(),
        ),
      ]);
      assert.equal(
        concurrent.filter(({ status }) => status === "fulfilled").length,
        1,
      );
      assert.equal(
        concurrent.filter(
          ({ status, reason }) =>
            status === "rejected" && reason.code === "GROUP_RESOURCE_CONFLICT",
        ).length,
        1,
      );
      const crossRole = await groupRepository.findActiveResourceConflicts({
        schoolYear: "2026-2027",
        roomId: roomB._id.toString(),
        educatorId: educatorB._id.toString(),
        assistantId: educatorA._id.toString(),
      });
      assert.equal(crossRole.length, 1);
    } finally {
      await connection.dropDatabase();
      await connection.close();
    }
  },
);
