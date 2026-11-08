import { AppError } from "../../utils/errors.js";
import { getCurrentCalendarDate, systemClock } from "../../utils/calendar.js";
import { PERMISSIONS } from "../../utils/access/permissions.js";
import { CATALOG_KIND, POSITION_CODE } from "../catalog/catalog.constants.js";
import {
  calculateMonthlySalaryCents,
  calculateRentCents,
} from "./salary.calculations.js";

export class OpenMonthService {
  constructor({
    expenseRepository,
    catalogRepository,
    personRepository,
    groupRepository,
    childRepository,
    authorizer,
    unitOfWork,
    clock = systemClock,
  }) {
    Object.assign(this, {
      expenseRepository,
      catalogRepository,
      personRepository,
      groupRepository,
      childRepository,
      authorizer,
      unitOfWork,
      clock,
    });
    authorizer.assertKnown(PERMISSIONS.EXPENSES_APPROVE);
  }
  async openCurrentMonth(actor, requestId) {
    this.authorizer.assertPermission(actor, PERMISSIONS.EXPENSES_APPROVE);
    const openedAt = this.clock.now();
    const month = getCurrentCalendarDate({ now: () => openedAt }).slice(0, 7);
    const markerCode = `OPEN_MONTH_${month.replace("-", "_")}`;
    try {
      return await this.unitOfWork.execute(async ({ session, recordAudit }) => {
        const marker = await this.catalogRepository.findActiveByCode(
          CATALOG_KIND.SETTINGS,
          markerCode,
          { session },
        );
        if (marker) return this.#readSnapshot(month, { session });
        const employees = await this.personRepository.findActiveEmployees({
          session,
        });
        const groups = await this.groupRepository.findActiveForSnapshot({
          session,
        });
        const occupiedByGroup =
          await this.childRepository.countOccupiedByGroups(
            groups.map(({ id }) => id),
            { session },
          );
        const payroll = new Map();
        for (const group of groups) {
          const occupiedSeats = occupiedByGroup.get(group.id) ?? 0;
          for (const [positionCode, personId] of [
            [POSITION_CODE.EDUCATOR, group.educatorId],
            [POSITION_CODE.ASSISTANT, group.assistantId],
          ]) {
            if (personId)
              payroll.set(personId, {
                positionCode,
                occupiedSeats,
                groupId: group.id,
              });
          }
        }
        const drafts = [
          {
            category: "RENT",
            amountCents: calculateRentCents(),
            serviceMonth: month,
            reason: `Monthly building rent ${month}`,
            status: "APPROVED",
            sourceKey: `MONTH:${month}:RENT`,
            snapshot: { openedAt, rentCents: calculateRentCents() },
          },
        ];
        for (const person of employees) {
          const assignment = payroll.get(person.id);
          const positionCode = person.employee.positionCode;
          const occupiedSeats = assignment?.occupiedSeats ?? 0;
          const amountCents = calculateMonthlySalaryCents({
            positionCode,
            occupiedSeats,
            salaryMinor: person.employee.salaryMinor,
          });
          drafts.push({
            category: "SALARY",
            amountCents,
            serviceMonth: month,
            reason: `Monthly salary ${month}: ${positionCode}`,
            status: "APPROVED",
            sourceKey: `MONTH:${month}:SALARY:${person.id}`,
            snapshot: {
              openedAt,
              personId: person.id,
              positionCode,
              salaryMinor: person.employee.salaryMinor,
              ...(assignment ? { groupId: assignment.groupId } : {}),
              occupiedSeats,
            },
          });
        }
        for (const draft of drafts)
          await this.expenseRepository.insert(draft, { session });
        await this.catalogRepository.insert(
          {
            kind: CATALOG_KIND.SETTINGS,
            code: markerCode,
            name: `Month ${month} opened at ${openedAt.toISOString()}`,
            active: true,
            revision: 1,
          },
          { session },
        );
        await recordAudit({
          actorId: actor.id,
          requestId,
          action: "finance.month.open",
          entityType: "CATALOG",
          entityId: markerCode,
          after: {
            month,
            openedAt: openedAt.toISOString(),
            employeeCount: employees.length,
            activeGroupCount: groups.length,
          },
          safeFields: [
            "month",
            "openedAt",
            "employeeCount",
            "activeGroupCount",
          ],
        });
        return { month, openedAt, expenses: drafts };
      });
    } catch (error) {
      if (error?.code !== 11000) throw error;
      const marker = await this.catalogRepository.findActiveByCode(
        CATALOG_KIND.SETTINGS,
        markerCode,
      );
      if (!marker) throw error;
      return this.#readSnapshot(month);
    }
  }
  async #readSnapshot(month, options) {
    const expenses = [];
    const rent = await this.expenseRepository.findBySourceKey(
      `MONTH:${month}:RENT`,
      options,
    );
    if (rent) expenses.push(rent);
    expenses.push(
      ...(await this.expenseRepository.findBySourcePrefix(
        `MONTH:${month}:SALARY:`,
        options,
      )),
    );
    return { month, openedAt: rent?.snapshot?.openedAt, expenses };
  }
}
