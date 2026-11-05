import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import mongoose from "mongoose";
import { AccountRolesService } from "../../src/modules/people/accountRoles.service.js";
import { authorizer } from "../../src/modules/people/access/authorizer.js";
import { PersonModel } from "../../src/modules/people/person.model.js";
import { PersonRepository } from "../../src/modules/people/person.repository.js";
import { CatalogModel } from "../../src/modules/catalog/catalog.model.js";
import { CatalogRepository } from "../../src/modules/catalog/catalog.repository.js";
import { AuditModel } from "../../src/modules/audit/audit.model.js";
import { AuditRepository } from "../../src/modules/audit/audit.repository.js";
import { AuditWriter } from "../../src/modules/audit/audit.writer.js";
import { UnitOfWork } from "../../src/workflows/unitOfWork.js";
import { ChildModel } from "../../src/modules/children/child.model.js";
import { ChildRepository } from "../../src/modules/children/child.repository.js";
import { GroupModel } from "../../src/modules/groups/group.model.js";
import { GroupRepository } from "../../src/modules/groups/group.repository.js";

test(
  "MongoDB: scoped reads filter record, count, and aggregation; parallel role changes preserve the last ADMIN",
  { skip: process.env.RUN_MONGO_TESTS !== "true" },
  async () => {
    const connection = await mongoose
      .createConnection(
        "mongodb://127.0.0.1:27017/?replicaSet=rs0&directConnection=true",
        {
          dbName: `kindergarten_access_${randomUUID().replaceAll("-", "")}`,
          serverSelectionTimeoutMS: 5000,
        },
      )
      .asPromise();
    try {
      const people = connection.model("Person", PersonModel.schema);
      const catalog = connection.model("Catalog", CatalogModel.schema);
      const audits = connection.model("AuditLog", AuditModel.schema);
      const children = connection.model("Child", ChildModel.schema);
      const groupModel = connection.model("Group", GroupModel.schema);
      await Promise.all([
        people.init(),
        catalog.init(),
        audits.init(),
        children.init(),
        groupModel.init(),
      ]);

      const parentId = new mongoose.Types.ObjectId();
      const otherGuardianId = new mongoose.Types.ObjectId();
      const groupOwnId = new mongoose.Types.ObjectId();
      const groupAssignedId = new mongoose.Types.ObjectId();
      await groupModel.insertMany([
        {
          _id: groupOwnId,
          name: "Своя група",
          ageCategory: 2,
          capacity: 10,
          status: "DRAFT",
        },
        {
          _id: groupAssignedId,
          name: "Призначена група",
          ageCategory: 4,
          capacity: 12,
          status: "DRAFT",
        },
      ]);
      const groupRepository = new GroupRepository({ groupModel });
      const groupScope = {
        kind: "RELATED",
        groupIds: [groupAssignedId.toString()],
      };
      const groupPage = await groupRepository.findAll({
        page: 1,
        pageSize: 1,
        scope: groupScope,
      });
      assert.equal(groupPage.total, 1);
      assert.equal(groupPage.groups[0].id, groupAssignedId.toString());
      assert.equal(
        await groupRepository.findById(groupOwnId.toString(), {
          scope: groupScope,
        }),
        null,
      );
      assert.deepEqual(
        await groupRepository.summarizeByAge({ scope: groupScope }),
        [{ ageCategory: 4, groupsCount: 1, totalCapacity: 12 }],
      );
      await children.insertMany([
        {
          firstName: "Своя",
          lastName: "Дитина",
          dateOfBirth: "2020-03-01",
          status: "ACTIVE",
          groupId: groupOwnId,
          guardians: [{ personId: parentId, relationship: "parent" }],
        },
        {
          firstName: "Дитина",
          lastName: "Групи",
          dateOfBirth: "2020-04-01",
          status: "ACTIVE",
          groupId: groupAssignedId,
          guardians: [{ personId: otherGuardianId, relationship: "parent" }],
        },
        {
          firstName: "Чужа",
          lastName: "Дитина",
          dateOfBirth: "2020-05-01",
          status: "APPLICANT",
          guardians: [{ personId: otherGuardianId, relationship: "parent" }],
        },
      ]);
      const childRepository = new ChildRepository({ childModel: children });
      const relatedScope = {
        kind: "RELATED",
        guardianId: parentId.toString(),
        groupIds: [groupAssignedId.toString()],
      };
      const page = await childRepository.findPageInScope({
        scope: relatedScope,
        page: 1,
        pageSize: 1,
      });
      assert.equal(page.total, 2);
      assert.equal(page.children.length, 1);
      assert.equal(
        await childRepository.findByIdInScope(
          (
            await children.findOne({ groupId: groupAssignedId }).lean()
          )._id.toString(),
          { kind: "RELATED", guardianId: parentId.toString(), groupIds: [] },
        ),
        null,
      );
      const aggregation = await childRepository.aggregateInScope(relatedScope, [
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ]);
      assert.deepEqual(aggregation, [{ _id: "ACTIVE", count: 2 }]);

      const adminIds = [
        new mongoose.Types.ObjectId(),
        new mongoose.Types.ObjectId(),
      ];
      await people.insertMany(
        adminIds.map((_id, index) => ({
          _id,
          firstName: `Admin${index}`,
          lastName: "Test",
          status: "ACTIVE",
          account: {
            email: `admin${index}@example.test`,
            passwordHash: "not-a-real-password-hash",
            roles: ["ADMIN"],
            enabled: true,
            tokenVersion: 0,
          },
        })),
      );
      const personRepository = new PersonRepository({ personModel: people });
      const settingsRepository = new CatalogRepository({
        catalogModel: catalog,
      });
      const auditRepository = new AuditRepository({ auditModel: audits });
      const auditWriter = new AuditWriter({
        auditRepository,
        clock: { now: () => new Date("2026-10-24T12:00:00.000Z") },
      });
      const unitOfWork = new UnitOfWork({ connection, auditWriter });
      const service = new AccountRolesService({
        authorizer,
        personRepository,
        settingsRepository,
        unitOfWork,
      });
      const actor = { id: adminIds[0].toString(), roles: ["ADMIN"] };
      const outcomes = await Promise.allSettled(
        adminIds.map((id, index) =>
          service.assign(
            { personId: id.toString(), roles: ["PARENT"] },
            actor,
            `parallel-role-change-${index}`,
          ),
        ),
      );
      assert.equal(
        outcomes.filter(({ status }) => status === "fulfilled").length,
        1,
      );
      assert.equal(
        outcomes.filter(({ status }) => status === "rejected").length,
        1,
      );
      assert.equal(await personRepository.countEnabledAdmins(), 1);
      assert.equal(
        await audits.countDocuments({ action: "account.roles.assign" }),
        1,
      );
      const guard = await catalog
        .findOne({ kind: "SETTINGS", code: "ACCOUNT_ADMIN_GUARD" })
        .lean();
      assert.equal(guard.revision, 1);
    } finally {
      await connection.close();
    }
  },
);
