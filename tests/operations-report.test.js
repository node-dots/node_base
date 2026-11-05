import test from "node:test";
import assert from "node:assert/strict";
import { OperationsReportService } from "../src/modules/reports/operationsReport.service.js";
import { authorizer } from "../src/modules/people/access/authorizer.js";

test("operations reports expose only aggregate benefits, published teacher load and ADMIN-only expenses", async () => {
  const calls = [];
  const service = new OperationsReportService({
    reportRepository: {
      async benefitDistribution(month) {
        calls.push(["benefits", month]);
        return [{ benefitCode: "NONE", basisPoints: 0, childrenCount: 3 }];
      },
      async publishedTeacherLoad(week, teacherId) {
        calls.push(["load", week, teacherId]);
        return [
          { teacherId, slotsCount: 2, groupsCount: 1, subjects: ["MUSIC"] },
        ];
      },
      async approvedExpenseCategories(month) {
        calls.push(["expenses", month]);
        return {
          totalCents: 100,
          categories: [
            { category: "SALARY", amountCents: 100, entriesCount: 1 },
          ],
        };
      },
    },
    authorizer,
    clock: { now: () => new Date("2027-03-15T10:00:00.000Z") },
  });
  const manager = { id: "manager", roles: ["MANAGER"] };
  assert.deepEqual(await service.benefits("2027-02", manager), {
    month: "2027-02",
    status: ["ACTIVE", "SUSPENDED"],
    distribution: [{ benefitCode: "NONE", basisPoints: 0, childrenCount: 3 }],
  });
  const teacher = { id: "507f1f77bcf86cd799439011", roles: ["TEACHER"] };
  assert.equal(
    (await service.teacherLoad("2027-03-01", teacher)).teachers[0].teacherId,
    teacher.id,
  );
  await service.teacherLoad("2027-03-01", manager);
  assert.equal(calls[1][2], teacher.id);
  assert.equal(calls[2][2], undefined);
  await assert.rejects(service.expenseCategories("2027-02", manager), {
    status: 403,
  });
  const admin = { id: "admin", roles: ["ADMIN"] };
  assert.equal(
    (await service.expenseCategories("2027-02", admin)).totalMinor,
    100,
  );
  await assert.rejects(service.benefits("2027-04", manager), {
    code: "FUTURE_ACTUAL_PERIOD",
  });
  await assert.rejects(service.teacherLoad("not-a-date", teacher), {
    code: "INVALID_SCHEDULE_WEEK",
  });
});
