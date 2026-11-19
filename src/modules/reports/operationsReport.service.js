import { AppError } from "../../utils/errors.js";
import { getCurrentCalendarDate, systemClock } from "../../utils/calendar.js";
import { PERMISSIONS } from "../../utils/access/permissions.js";

function assertMonth(month) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))
    throw new AppError(400, "INVALID_REPORT_MONTH", "Month must be YYYY-MM");
}

export class OperationsReportService {
  constructor({ reportRepository, authorizer, clock = systemClock }) {
    Object.assign(this, { reportRepository, authorizer, clock });
    authorizer.assertKnown(PERMISSIONS.REPORTS_OPERATIONS_READ);
    authorizer.assertKnown(PERMISSIONS.REPORTS_FINANCE_READ);
  }
  async benefits(month, actor) {
    this.authorizer.assertPermission(
      actor,
      PERMISSIONS.REPORTS_OPERATIONS_READ,
    );
    assertMonth(month);
    if (month > getCurrentCalendarDate(this.clock).slice(0, 7))
      throw new AppError(
        400,
        "FUTURE_ACTUAL_PERIOD",
        "Actual reports are unavailable for future months",
      );
    return {
      month,
      status: ["ACTIVE", "SUSPENDED"],
      distribution: await this.reportRepository.benefitDistribution(month),
    };
  }
  async teacherLoad(weekStart, actor) {
    const parsedWeek = new Date(`${weekStart}T00:00:00.000Z`);
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(weekStart) ||
      !Number.isFinite(parsedWeek.getTime()) ||
      parsedWeek.toISOString().slice(0, 10) !== weekStart
    )
      throw new AppError(
        400,
        "INVALID_SCHEDULE_WEEK",
        "weekStart must be a real YYYY-MM-DD date",
      );
    const elevated = actor.roles.some((role) =>
      ["ADMIN", "MANAGER"].includes(role),
    );
    let teacherId;
    if (elevated)
      this.authorizer.assertPermission(
        actor,
        PERMISSIONS.REPORTS_OPERATIONS_READ,
      );
    else if (actor.roles.includes("TEACHER")) teacherId = actor.id;
    else
      this.authorizer.assertPermission(
        actor,
        PERMISSIONS.REPORTS_OPERATIONS_READ,
      );
    return {
      weekStart,
      status: "PUBLISHED",
      teachers: await this.reportRepository.publishedTeacherLoad(
        weekStart,
        teacherId,
      ),
    };
  }
  async expenseCategories(month, actor) {
    this.authorizer.assertPermission(actor, PERMISSIONS.REPORTS_FINANCE_READ);
    assertMonth(month);
    if (month > getCurrentCalendarDate(this.clock).slice(0, 7))
      throw new AppError(
        400,
        "FUTURE_ACTUAL_PERIOD",
        "Actual reports are unavailable for future months",
      );
    const result = await this.reportRepository.approvedExpenseCategories(month);
    return {
      month,
      status: "APPROVED",
      totalMinor: result.totalCents,
      categories: result.categories.map(
        ({ category, amountCents, entriesCount }) => ({
          category,
          amountMinor: amountCents,
          entriesCount,
        }),
      ),
    };
  }
}
