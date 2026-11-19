import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import mongoose from "mongoose";
import { ChildModel } from "../../src/modules/children/child.model.js";
import { ScheduleModel } from "../../src/modules/schedules/schedule.model.js";
import { ExpenseModel } from "../../src/modules/expenses/expense.model.js";
import { OperationsReportRepository } from "../../src/modules/reports/operationsReport.repository.js";

test(
  "MongoDB: operations reports aggregate effective benefits, published-only scoped teacher load and approved expense categories",
  { skip: process.env.RUN_MONGO_TESTS !== "true" },
  async () => {
    const connection = await mongoose
      .createConnection(
        "mongodb://127.0.0.1:27017/?replicaSet=rs0&directConnection=true",
        {
          dbName: `operations_reports_${randomUUID().replaceAll("-", "")}`,
          serverSelectionTimeoutMS: 5000,
        },
      )
      .asPromise();
    try {
      const children = connection.model("Child", ChildModel.schema);
      const schedules = connection.model("Schedule", ScheduleModel.schema);
      const expenses = connection.model("Expense", ExpenseModel.schema);
      await Promise.all([children.init(), schedules.init(), expenses.init()]);
      const groupId = new mongoose.Types.ObjectId();
      const roomId = new mongoose.Types.ObjectId();
      const teacherId = new mongoose.Types.ObjectId();
      const otherTeacherId = new mongoose.Types.ObjectId();
      const guardianId = new mongoose.Types.ObjectId();
      await children.create([
        {
          firstName: "Private",
          lastName: "One",
          dateOfBirth: "2021-01-01",
          status: "ACTIVE",
          groupId,
          guardians: [{ personId: guardianId, relationship: "parent" }],
          benefitAssignments: [
            {
              benefitCode: "LOW_INCOME",
              basisPoints: 1000,
              startMonth: "2027-02",
            },
          ],
        },
        {
          firstName: "Private",
          lastName: "Two",
          dateOfBirth: "2021-02-01",
          status: "SUSPENDED",
          groupId,
        },
        {
          firstName: "Private",
          lastName: "Left",
          dateOfBirth: "2021-03-01",
          status: "LEFT",
          benefitAssignments: [
            {
              benefitCode: "LOW_INCOME",
              basisPoints: 1000,
              startMonth: "2027-01",
            },
          ],
        },
        {
          firstName: "Private",
          lastName: "Applicant",
          dateOfBirth: "2021-04-01",
          status: "APPLICANT",
        },
      ]);
      const slot = (id, teacher, subject) => ({
        id,
        groupId,
        roomId,
        teacherId: teacher,
        subjectCode: subject,
        weekday: 1,
        startTime: "09:00",
        endTime: "09:30",
      });
      await schedules.create({
        weekStart: "2027-03-01",
        revision: 2,
        updatedById: teacherId,
        slots: [
          slot("draft-only", teacherId, "ENGLISH"),
          slot("draft-two", teacherId, "MUSIC"),
        ],
        published: {
          revision: 1,
          publishedAt: new Date("2027-03-01T00:00:00Z"),
          publishedById: teacherId,
          resourceRevision: 1,
          slots: [
            slot("published-own", teacherId, "MUSIC"),
            slot("published-other-1", otherTeacherId, "ENGLISH"),
            slot("published-other-2", otherTeacherId, "CHESS"),
          ],
        },
      });
      await expenses.create([
        {
          category: "SALARY",
          amountCents: 500,
          serviceMonth: "2027-03",
          reason: "Payroll",
          status: "APPROVED",
        },
        {
          category: "RENT",
          amountCents: 300,
          serviceMonth: "2027-03",
          reason: "Rent",
          status: "APPROVED",
        },
        {
          category: "FOOD",
          amountCents: 999,
          serviceMonth: "2027-03",
          reason: "Draft",
          status: "DRAFT",
        },
      ]);
      const repository = new OperationsReportRepository({
        childModel: children,
        scheduleModel: schedules,
        expenseModel: expenses,
      });
      const benefits = await repository.benefitDistribution("2027-03");
      assert.deepEqual(benefits, [
        { benefitCode: "LOW_INCOME", basisPoints: 1000, childrenCount: 1 },
        { benefitCode: "NONE", basisPoints: 0, childrenCount: 1 },
      ]);
      const ownLoad = await repository.publishedTeacherLoad(
        "2027-03-01",
        teacherId.toString(),
      );
      assert.equal(ownLoad[0].slotsCount, 1);
      assert.equal(ownLoad[0].subjects[0], "MUSIC");
      const allLoad = await repository.publishedTeacherLoad("2027-03-01");
      assert.deepEqual(
        allLoad.map((teacher) => teacher.slotsCount).toSorted(),
        [1, 2],
      );
      const expensesSummary =
        await repository.approvedExpenseCategories("2027-03");
      assert.equal(expensesSummary.totalCents, 800);
      assert.deepEqual(
        expensesSummary.categories.map(({ amountCents }) => amountCents),
        [300, 500, 0, 0],
      );
    } finally {
      await connection.dropDatabase();
      await connection.close();
    }
  },
);
