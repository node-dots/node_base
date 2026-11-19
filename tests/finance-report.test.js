import test from "node:test";
import assert from "node:assert/strict";
import { FinanceReportService } from "../src/modules/reports/financeReport.service.js";
import { authorizer } from "../src/modules/people/access/authorizer.js";

test("monthly finance report keeps accrual, receipts and paid expenses on separate timelines", async () => {
  const service = new FinanceReportService({
    reportRepository: {
      async accruedIncome() {
        return 5000;
      },
      async receipts() {
        return 1600;
      },
      async refunds() {
        return 100;
      },
      async approvedExpenseBreakdown() {
        return {
          totalCents: 1200,
          rows: 1,
          categories: [{ category: "RENT", amountCents: 1200 }],
        };
      },
      async paidExpenses() {
        return 900;
      },
      async unapprovedSalaryCount() {
        return 2;
      },
      async lateConfirmations() {
        return 1;
      },
    },
    invoiceRepository: {
      async aggregateCurrentBalances({ asOf }) {
        return {
          currentOutstandingCents: 300,
          currentOverdueCents: 100,
          currentRefundDueCents: 50,
          asOf,
        };
      },
    },
    authorizer,
    clock: { now: () => new Date("2026-03-15T12:00:00.000Z") },
  });
  const report = await service.monthly("2026-02", {
    id: "admin",
    roles: ["ADMIN"],
  });
  assert.equal(report.accruedIncomeMinor, 5000);
  assert.equal(report.receiptsNetMinor, 1500);
  assert.equal(report.expensesMinor, 1200);
  assert.equal(report.resultMinor, 3800);
  assert.equal(report.cashFlowMinor, 600);
  assert.deepEqual(report.expenseBreakdown, [
    { category: "RENT", amountMinor: 1200 },
    { category: "SALARY", amountMinor: 0 },
    { category: "FOOD", amountMinor: 0 },
    { category: "OTHER", amountMinor: 0 },
  ]);
  assert.equal(report.currentOutstandingMinor, 300);
  assert.equal(report.basis, undefined);
  assert.ok(
    report.notes.some((note) => note.startsWith("FOOD_COST_NOT_RECORDED")),
  );
  assert.ok(
    report.notes.some((note) => note.startsWith("UNAPPROVED_SALARIES")),
  );
  assert.ok(report.notes.some((note) => note.startsWith("LATE_CONFIRMATIONS")));
  await assert.rejects(
    service.monthly("2026-04", { id: "admin", roles: ["ADMIN"] }),
    { code: "FUTURE_ACTUAL_PERIOD" },
  );
  await assert.rejects(
    service.monthly("2026-02", { id: "manager", roles: ["MANAGER"] }),
    { status: 403 },
  );
});
