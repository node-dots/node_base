import { AppError, ResourceNotFoundError } from "../../utils/errors.js";
import { getCurrentCalendarDate, systemClock } from "../../utils/calendar.js";
import { PERMISSIONS } from "../../utils/access/permissions.js";
import { createBenefitAssignment } from "../catalog/financialRules.js";

export class ChildBenefitService {
  constructor({
    childRepository,
    catalogRepository,
    authorizer,
    unitOfWork,
    clock = systemClock,
  }) {
    Object.assign(this, {
      childRepository,
      catalogRepository,
      authorizer,
      unitOfWork,
      clock,
    });
    authorizer.assertKnown(PERMISSIONS.CHILDREN_BENEFIT_ASSIGN);
  }

  async assign(
    childId,
    { benefitCode, startMonth, endMonth },
    actor,
    requestId,
  ) {
    this.authorizer.assertPermission(
      actor,
      PERMISSIONS.CHILDREN_BENEFIT_ASSIGN,
    );
    const effectiveDate = `${startMonth}-01`;
    const benefit = await this.catalogRepository.findLatestValid(
      "BENEFIT",
      benefitCode,
      effectiveDate,
    );
    if (!benefit)
      throw new AppError(
        404,
        "BENEFIT_NOT_FOUND",
        "No benefit is valid for the requested month",
      );
    return this.unitOfWork.execute(async ({ session, recordAudit }) => {
      const child = await this.childRepository.findByIdForUpdate(childId, {
        session,
      });
      if (!child)
        throw new ResourceNotFoundError("CHILD_NOT_FOUND", "Child not found");
      const assignment = createBenefitAssignment({
        benefit,
        startMonth,
        endMonth,
        existing: child.benefitAssignments ?? [],
        today: getCurrentCalendarDate(this.clock),
      });
      const updated = await this.childRepository.updateBenefitAssignmentsById(
        childId,
        [...(child.benefitAssignments ?? []), assignment],
        { session },
      );
      if (!updated)
        throw new ResourceNotFoundError("CHILD_NOT_FOUND", "Child not found");
      await recordAudit({
        actorId: actor.id,
        requestId,
        action: "child.benefit.assign",
        entityType: "CHILD",
        entityId: childId,
        after: {
          benefitCode,
          basisPoints: assignment.basisPoints,
          startMonth,
          endMonth: endMonth ?? null,
        },
        safeFields: ["benefitCode", "basisPoints", "startMonth", "endMonth"],
      });
      return updated;
    });
  }
}
