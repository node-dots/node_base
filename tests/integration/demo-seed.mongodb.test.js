import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import mongoose from "mongoose";
import { AuditModel } from "../../src/modules/audit/audit.model.js";
import { CatalogModel } from "../../src/modules/catalog/catalog.model.js";
import { seedCatalog } from "../../src/modules/catalog/catalog.seed.js";
import { GroupModel } from "../../src/modules/groups/group.model.js";
import { demoGroups } from "../../scripts/demo-groups.js";
import { PersonModel } from "../../src/modules/people/person.model.js";
import { ChildModel } from "../../src/modules/children/child.model.js";
import { InvoiceModel } from "../../src/modules/invoices/invoice.model.js";
import { PaymentModel } from "../../src/modules/payments/payment.model.js";
import { RefundModel } from "../../src/modules/payments/refund.model.js";
import { ExpenseModel } from "../../src/modules/expenses/expense.model.js";
import { ScheduleModel } from "../../src/modules/schedules/schedule.model.js";
import {
  bootstrapAdmin,
  readBootstrapAdminConfig,
} from "../../src/modules/auth/bootstrapAdmin.js";
import { PersonRepository } from "../../src/modules/people/person.repository.js";
import { seedDemoScenario } from "../../scripts/demo-scenario.js";

test(
  "MongoDB: full TASK-039 demo seed is repeatable and preserves manual edits",
  { skip: process.env.RUN_MONGO_TESTS !== "true" },
  async () => {
    const databaseName = `kindergarten_test_${randomUUID().replaceAll("-", "")}`;
    await mongoose.connect(
      "mongodb://127.0.0.1:27017/?replicaSet=rs0&directConnection=true",
      { dbName: databaseName, serverSelectionTimeoutMS: 5000 },
    );

    try {
      const models = [
        AuditModel,
        CatalogModel,
        GroupModel,
        PersonModel,
        ChildModel,
        InvoiceModel,
        PaymentModel,
        RefundModel,
        ExpenseModel,
        ScheduleModel,
      ];
      await Promise.all(models.map((model) => model.init()));
      await seedCatalog(CatalogModel);
      await GroupModel.create(demoGroups);
      await GroupModel.updateOne(
        { _id: demoGroups[0]._id },
        { $set: { name: "manual-test-preserved" } },
      );
      const personRepository = new PersonRepository({
        personModel: PersonModel,
      });
      const adminConfig = readBootstrapAdminConfig({
        BOOTSTRAP_ADMIN_EMAIL: "demo-seed-admin@example.test",
        BOOTSTRAP_ADMIN_PASSWORD: "local-demo-admin-password",
        BOOTSTRAP_ADMIN_FIRST_NAME: "Seed",
        BOOTSTRAP_ADMIN_LAST_NAME: "Admin",
      });
      await bootstrapAdmin({ config: adminConfig, personRepository });

      const first = await seedDemoScenario({
        databaseName,
        password: "local-demo-parent-password",
      });
      await GroupModel.updateOne(
        { _id: demoGroups[0]._id },
        { $set: { name: "manual-test-preserved" } },
      );
      await PersonModel.updateOne(
        { "account.email": "demo.parent1@example.test" },
        { $set: { firstName: "Manual Parent Edit" } },
      );
      const second = await seedDemoScenario({
        databaseName,
        password: "local-demo-parent-password",
      });

      assert.equal(first.children, 22);
      assert.equal(second.children, 22);
      assert.equal(second.invoices, 5);
      assert.equal(await PersonModel.countDocuments(), 14);
      assert.equal(await ChildModel.countDocuments(), 22);
      assert.equal(await InvoiceModel.countDocuments(), 5);
      assert.equal(await PaymentModel.countDocuments(), 3);
      assert.equal(await RefundModel.countDocuments(), 1);
      assert.equal(await ExpenseModel.countDocuments(), 2);
      assert.equal(
        await ScheduleModel.countDocuments({
          "published.revision": { $gte: 1 },
        }),
        1,
      );
      assert.equal(
        (await GroupModel.findById(demoGroups[0]._id).lean()).name,
        "manual-test-preserved",
      );
      assert.equal(
        (
          await PersonModel.findOne({
            "account.email": "demo.parent1@example.test",
          }).lean()
        ).firstName,
        "Manual Parent Edit",
      );
      assert.equal(
        (
          await ExpenseModel.findOne({
            reason: "TASK-039 synthetic demo canceled expense",
          }).lean()
        ).status,
        "CANCELLED",
      );
    } finally {
      await mongoose.connection.dropDatabase();
      await mongoose.disconnect();
    }
  },
);
