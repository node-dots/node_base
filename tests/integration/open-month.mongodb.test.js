import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import mongoose from "mongoose";
import { ExpenseModel } from "../../src/modules/expenses/expense.model.js";
import { ExpenseRepository } from "../../src/modules/expenses/expense.repository.js";
import { OpenMonthService } from "../../src/modules/expenses/openMonth.service.js";
import { CatalogModel } from "../../src/modules/catalog/catalog.model.js";
import { CatalogRepository } from "../../src/modules/catalog/catalog.repository.js";
import { PersonModel } from "../../src/modules/people/person.model.js";
import { PersonRepository } from "../../src/modules/people/person.repository.js";
import { GroupModel } from "../../src/modules/groups/group.model.js";
import { GroupRepository } from "../../src/modules/groups/group.repository.js";
import { ChildModel } from "../../src/modules/children/child.model.js";
import { ChildRepository } from "../../src/modules/children/child.repository.js";
import { AuditModel } from "../../src/modules/audit/audit.model.js";
import { AuditRepository } from "../../src/modules/audit/audit.repository.js";
import { AuditWriter } from "../../src/modules/audit/audit.writer.js";
import { UnitOfWork } from "../../src/workflows/unitOfWork.js";
import { authorizer } from "../../src/modules/people/access/authorizer.js";
import { createFixedClock } from "../../src/utils/calendar.js";

test(
  "MongoDB: concurrent current-month opens create one immutable rent snapshot and marker",
  { skip: process.env.RUN_MONGO_TESTS !== "true" },
  async () => {
    const connection = await mongoose
      .createConnection(
        "mongodb://127.0.0.1:27017/?replicaSet=rs0&directConnection=true",
        {
          dbName: `open_month_${randomUUID().replaceAll("-", "")}`,
          serverSelectionTimeoutMS: 5000,
        },
      )
      .asPromise();
    try {
      const models = [
        ExpenseModel,
        CatalogModel,
        PersonModel,
        GroupModel,
        ChildModel,
        AuditModel,
      ].map((base) => connection.model(base.modelName, base.schema));
      const [expense, catalog, person, group, child, audit] = models;
      await Promise.all(models.map((model) => model.init()));
      const expenseRepository = new ExpenseRepository({
        expenseModel: expense,
      });
      const catalogRepository = new CatalogRepository({
        catalogModel: catalog,
      });
      const auditWriter = new AuditWriter({
        auditRepository: new AuditRepository({ auditModel: audit }),
        clock: createFixedClock("2026-03-05T08:00:00.000Z"),
      });
      const unitOfWork = new UnitOfWork({ connection, auditWriter });
      const service = new OpenMonthService({
        expenseRepository,
        catalogRepository,
        personRepository: new PersonRepository({ personModel: person }),
        groupRepository: new GroupRepository({ groupModel: group }),
        childRepository: new ChildRepository({ childModel: child }),
        authorizer,
        unitOfWork,
        clock: createFixedClock("2026-03-05T08:00:00.000Z"),
      });
      const actor = {
        id: new mongoose.Types.ObjectId().toString(),
        roles: ["ADMIN"],
      };
      const results = await Promise.all([
        service.openCurrentMonth(actor, "open-1"),
        service.openCurrentMonth(actor, "open-2"),
      ]);
      assert.deepEqual(
        results.map(({ month }) => month),
        ["2026-03", "2026-03"],
      );
      assert.equal(
        await expense.countDocuments({ sourceKey: "MONTH:2026-03:RENT" }),
        1,
      );
      assert.equal(
        await catalog.countDocuments({
          kind: "SETTINGS",
          code: "OPEN_MONTH_2026_03",
        }),
        1,
      );
      assert.equal(
        await audit.countDocuments({ action: "finance.month.open" }),
        1,
      );
    } finally {
      await connection.dropDatabase();
      await connection.close();
    }
  },
);
