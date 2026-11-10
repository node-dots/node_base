import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import mongoose from "mongoose";
import { createApp } from "../../src/app.js";
import { readSecurityConfig } from "../../src/config/security.js";
import { createSecurityMiddleware } from "../../src/middleware/security.js";
import { createApiRouter } from "../../src/modules/index.js";
import { createAuthModule } from "../../src/modules/auth/auth.module.js";
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

      const securityConfig = readSecurityConfig({
        RATE_LIMIT_REQUESTS: "100",
        WRITE_RATE_LIMIT_REQUESTS: "30",
        LOGIN_RATE_LIMIT_REQUESTS: "10",
      });
      const authModule = createAuthModule({
        config: {
          secret: "demo-seed-integration-secret-32-bytes-long",
          issuer: "https://demo-seed.example.test",
          audience: "demo-seed-integration",
        },
        loginRateLimiter:
          createSecurityMiddleware(securityConfig).loginRateLimiter,
      });
      const app = createApp({
        apiRouter: createApiRouter({ authModule }),
        securityConfig,
        isStorageReady: async () => mongoose.connection.readyState === 1,
      });
      const server = app.listen(0, "127.0.0.1");
      await new Promise((resolve, reject) => {
        server.once("listening", resolve);
        server.once("error", reject);
      });
      const origin = `http://127.0.0.1:${server.address().port}`;
      async function login(email, password) {
        const response = await fetch(`${origin}/api/v1/auth/login`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ email, password }),
        });
        assert.equal(response.status, 200);
        return (await response.json()).data.accessToken;
      }
      async function get(path, token) {
        return fetch(`${origin}${path}`, {
          headers: { authorization: `Bearer ${token}` },
        });
      }
      async function post(path, token, body) {
        return fetch(`${origin}${path}`, {
          method: "POST",
          headers: {
            authorization: `Bearer ${token}`,
            "content-type": "application/json",
          },
          body: JSON.stringify(body),
        });
      }
      try {
        const adminToken = await login(
          "demo-seed-admin@example.test",
          "local-demo-admin-password",
        );
        const parentOneToken = await login(
          "demo.parent1@example.test",
          "local-demo-parent-password",
        );
        const parentTwoToken = await login(
          "demo.parent2@example.test",
          "local-demo-parent-password",
        );
        const ownChildId = second.records.children["child-full-group-01"];
        const foreignChildId = second.records.children["child-annual-refund"];
        assert.equal(
          (await get(`/api/v1/children/${ownChildId}`, parentOneToken)).status,
          200,
        );
        assert.equal(
          (await get(`/api/v1/children/${foreignChildId}`, parentOneToken))
            .status,
          404,
        );
        assert.equal(
          (await get(`/api/v1/invoices/children/${ownChildId}`, parentOneToken))
            .status,
          200,
        );
        const refundResponse = await get(
          `/api/v1/payments/${second.records.payments.annualTuition}/refunds`,
          parentTwoToken,
        );
        assert.equal(refundResponse.status, 200);
        assert.equal((await refundResponse.json()).data[0].status, "CONFIRMED");

        const groupsResponse = await get("/api/v1/groups/summary", adminToken);
        assert.equal(groupsResponse.status, 200);
        assert.ok((await groupsResponse.json()).data.length > 0);
        const employeeListResponse = await get(
          "/api/v1/people/employees?page=1&pageSize=100",
          adminToken,
        );
        assert.equal(employeeListResponse.status, 200);
        const employeeList = (await employeeListResponse.json()).data;
        assert.ok(employeeList.employees.length > 0);
        assert.equal(
          employeeList.pagination.total,
          employeeList.employees.length,
        );
        assert.ok(
          employeeList.employees.some(
            ({ employee }) => employee?.salaryMinor !== undefined,
          ),
        );
        assert.equal(
          (
            await get(
              "/api/v1/people/employees?page=1&pageSize=100",
              parentOneToken,
            )
          ).status,
          403,
        );
        for (const [resource, collection] of [
          ["invoices", "invoices"],
          ["payments", "payments"],
          ["expenses", "expenses"],
        ]) {
          const listResponse = await get(
            `/api/v1/${resource}?month=${second.finance.month}&page=1&pageSize=100`,
            adminToken,
          );
          assert.equal(listResponse.status, 200);
          const list = (await listResponse.json()).data;
          assert.ok(Array.isArray(list[collection]));
          assert.equal(list.pagination.total, list[collection].length);
          assert.equal(
            (
              await get(
                `/api/v1/${resource}?month=${second.finance.month}&page=1&pageSize=100`,
                parentOneToken,
              )
            ).status,
            403,
          );
        }
        const financeResponse = await get(
          `/api/v1/reports/finance/monthly?month=${second.finance.month}`,
          adminToken,
        );
        assert.equal(financeResponse.status, 200);
        const financeBody = (await financeResponse.json()).data;
        assert.equal(
          financeBody.accruedIncomeMinor,
          second.finance.accruedIncomeMinor,
        );
        assert.equal(financeBody.cashFlowMinor, second.finance.cashFlowMinor);
        assert.equal(
          (
            await get(
              `/api/v1/expenses/totals?month=${second.finance.month}`,
              adminToken,
            )
          ).status,
          200,
        );
        const draftResponse = await get(
          `/api/v1/schedules/${second.records.scheduleDraftWeek}/draft`,
          adminToken,
        );
        assert.equal(draftResponse.status, 200);
        assert.equal((await draftResponse.json()).data.slots.length, 1);
        const publishedResponse = await get(
          `/api/v1/schedules/${second.publishedWeek}/published`,
          adminToken,
        );
        assert.equal(publishedResponse.status, 200);
        assert.equal((await publishedResponse.json()).data.slots.length, 30);

        const financialScenario = {
          groups: [{ id: "demo-group", age: 4, capacity: 10 }],
          ages: [{ code: "AGE_4", age: 4, demand: 5, tariffMinor: 100_000 }],
          discountMix: [{ basisPoints: 0, shareBasisPoints: 10_000 }],
          staff: [],
          rentMinor: 0,
          otherCosts: [],
        };
        const forecastResponse = await post(
          "/api/v1/finance/scenarios/forecast",
          adminToken,
          financialScenario,
        );
        assert.equal(forecastResponse.status, 200);
        assert.ok((await forecastResponse.json()).data.assumptions.length > 0);
        const breakevenResponse = await post(
          "/api/v1/finance/scenarios/breakeven",
          adminToken,
          { scenario: financialScenario, maxCandidates: 10 },
        );
        assert.equal(breakevenResponse.status, 200);
        const breakeven = (await breakevenResponse.json()).data;
        assert.ok(
          breakeven.candidatesChecked > 0 && breakeven.candidatesChecked <= 11,
        );

        const demoGroup = await GroupModel.findById(
          second.records.groups[0],
        ).lean();
        const searchInput = {
          weekStart: second.publishedWeek,
          schoolYear: demoGroup.schoolYear,
          groupRanges: [
            {
              ageCode: "AGE_4",
              age: 4,
              children: 2,
              minGroups: 1,
              maxGroups: 1,
            },
          ],
          rooms: [
            {
              id: "0000000000000000000000a1",
              active: true,
              roomType: "GROUP",
              capacity: 4,
            },
          ],
          teacherVariants: [
            {
              id: "demo-teacher-variant",
              teachers: [
                {
                  id: "0000000000000000000000a2",
                  subjectCode: "MATH",
                  availability: [
                    { weekday: 1, startTime: "09:00", endTime: "17:00" },
                  ],
                },
              ],
            },
          ],
          program: [
            { subjectCode: "MATH", sessionsPerWeek: 1, durationMinutes: 30 },
          ],
          fixedStaff: [],
          financial: {
            ages: financialScenario.ages,
            discountMix: financialScenario.discountMix,
            rentMinor: 0,
            otherCosts: [],
            foodCostMinor: 0,
          },
        };
        const searchResponse = await post(
          "/api/v1/finance/scenarios/compare-configurations",
          adminToken,
          searchInput,
        );
        assert.equal(searchResponse.status, 200);
        const search = (await searchResponse.json()).data;
        assert.ok(search.budget.candidatesChecked > 0);
        assert.ok(
          search.budget.candidatesChecked <= search.budget.candidateLimit,
        );

        const generatorWeek = new Date(`${second.publishedWeek}T00:00:00.000Z`);
        generatorWeek.setUTCDate(generatorWeek.getUTCDate() + 14);
        const generatorWeekStart = generatorWeek.toISOString().slice(0, 10);
        const generatorResponse = await post(
          `/api/v1/schedules/${generatorWeekStart}/generate`,
          adminToken,
          { expectedRevision: 0, fixedSlots: [] },
        );
        assert.equal(generatorResponse.status, 200);
        const generated = (await generatorResponse.json()).data;
        assert.equal(generated.draft.revision, 1);
        assert.ok(generated.draft.slots.length > 0);
        assert.ok(generated.budget.limits.checks > 0);
      } finally {
        await new Promise((resolve) => server.close(resolve));
      }

      assert.equal(first.children, 22);
      assert.equal(second.children, 22);
      assert.equal(second.invoices, 5);
      assert.ok(first.finance.receiptsNetMinor > 0);
      assert.ok(first.finance.cashFlowMinor > 0);
      assert.equal(second.finance.month, first.finance.month);
      assert.equal(
        second.finance.accruedIncomeMinor,
        first.finance.accruedIncomeMinor,
      );
      if (first.currentMonthInvoiceCount > 0)
        assert.ok(first.finance.accruedIncomeMinor > 0);
      assert.equal(await PersonModel.countDocuments(), 14);
      assert.equal(await ChildModel.countDocuments(), 22);
      assert.equal(await InvoiceModel.countDocuments(), 5);
      assert.equal(await PaymentModel.countDocuments(), 3);
      assert.equal(await RefundModel.countDocuments(), 1);
      assert.equal(await ExpenseModel.countDocuments(), 3);
      assert.equal(
        await ScheduleModel.countDocuments({
          "published.revision": { $gte: 1 },
        }),
        1,
      );
      assert.equal(await ScheduleModel.countDocuments(), 3);
      assert.equal(
        await ScheduleModel.countDocuments({
          published: { $exists: false },
        }),
        2,
      );
      assert.equal(
        await ScheduleModel.countDocuments({
          weekStart: second.records.scheduleDraftWeek,
          published: { $exists: false },
          revision: 1,
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
      assert.equal(
        (
          await ExpenseModel.findOne({
            reason: "TASK-039 synthetic demo draft expense",
          }).lean()
        ).status,
        "DRAFT",
      );
    } finally {
      await mongoose.connection.dropDatabase();
      await mongoose.disconnect();
    }
  },
);
