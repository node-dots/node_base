import { AppError } from "../../utils/errors.js";
import {
  getCurrentCalendarDate,
  getServiceMonthUtcRange,
  systemClock,
} from "../../utils/calendar.js";
import { PERMISSIONS } from "../../utils/access/permissions.js";

export class FinanceReportService {
  constructor({
    reportRepository,
    invoiceRepository,
    authorizer,
    clock = systemClock,
  }) {
    Object.assign(this, {
      reportRepository,
      invoiceRepository,
      authorizer,
      clock,
    });
    authorizer.assertKnown(PERMISSIONS.REPORTS_FINANCE_READ);
  }
  async monthly(month, actor) {
    this.authorizer.assertPermission(actor, PERMISSIONS.REPORTS_FINANCE_READ);
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))
      throw new AppError(400, "INVALID_REPORT_MONTH", "Month must be YYYY-MM");
    const asOf = this.clock.now();
    const currentMonth = getCurrentCalendarDate({ now: () => asOf }).slice(
      0,
      7,
    );
    if (month > currentMonth)
      throw new AppError(
        400,
        "FUTURE_ACTUAL_PERIOD",
        "Actual financial reports are unavailable for future months",
      );
    const { start, end } = getServiceMonthUtcRange(month);
    const [
      accruedIncomeMinor,
      receipts,
      refunds,
      expenseSummary,
      paidExpensesMinor,
      unapprovedSalaryCount,
      lateConfirmationCount,
      balances,
    ] = await Promise.all([
      this.reportRepository.accruedIncome(month),
      this.reportRepository.receipts(start, end),
      this.reportRepository.refunds(start, end),
      this.reportRepository.approvedExpenseBreakdown(month),
      this.reportRepository.paidExpenses(month),
      this.reportRepository.unapprovedSalaryCount(month),
      this.reportRepository.lateConfirmations(start, end),
      this.invoiceRepository.aggregateCurrentBalances({ asOf }),
    ]);
    const expensesMinor = expenseSummary.totalCents;
    const receiptsNetMinor = receipts - refunds;
    const notes = [
      "FOOD_COST_NOT_RECORDED: actual food cost is not captured as meal tariff.",
    ];
    if (expenseSummary.rows === 0)
      notes.push(
        "NO_APPROVED_EXPENSES: no approved expenses are recorded for the service month.",
      );
    const approvedCategories = new Set(
      expenseSummary.categories.map(({ category }) => category),
    );
    if (!approvedCategories.has("RENT"))
      notes.push(
        "MISSING_RENT_EXPENSE: no approved rent expense is recorded for the service month.",
      );
    if (!approvedCategories.has("SALARY"))
      notes.push(
        "MISSING_SALARY_EXPENSES: no approved salary expenses are recorded for the service month.",
      );
    if (unapprovedSalaryCount)
      notes.push(
        `UNAPPROVED_SALARIES: ${unapprovedSalaryCount} salary expenses remain in draft.`,
      );
    if (lateConfirmationCount)
      notes.push(
        `LATE_CONFIRMATIONS: ${lateConfirmationCount} receipts were confirmed during this month after their actual occurrence month.`,
      );
    if (month === currentMonth)
      notes.push("PRELIMINARY_CURRENT_MONTH: period is still in progress.");
    return {
      month,
      accruedIncomeMinor,
      receiptsNetMinor,
      expensesMinor,
      resultMinor: accruedIncomeMinor - expensesMinor,
      cashFlowMinor: receiptsNetMinor - paidExpensesMinor,
      expenseBreakdown: ["RENT", "SALARY", "FOOD", "OTHER"].map((category) => ({
        category,
        amountMinor:
          expenseSummary.categories.find((item) => item.category === category)
            ?.amountCents ?? 0,
      })),
      currentOutstandingMinor: balances.currentOutstandingCents,
      currentOverdueMinor: balances.currentOverdueCents,
      currentRefundDueMinor: balances.currentRefundDueCents,
      asOf,
      notes,
    };
  }
}
