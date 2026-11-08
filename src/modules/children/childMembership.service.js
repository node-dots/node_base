import { AppError, ResourceNotFoundError } from "../../utils/errors.js";
import {
  calculateAgeOnSchoolYearStart,
  getBillingStartMonth,
  getCurrentCalendarDate,
  getSchoolYear,
  systemClock,
} from "../../utils/calendar.js";
import { PERMISSIONS } from "../../utils/access/permissions.js";
import { CHILD_LIMITS, CHILD_STATUS } from "./child.constants.js";
import { assertChildStateTransition } from "./child.rules.js";
import { CATALOG_KIND } from "../catalog/catalog.constants.js";

const CHILD_NOT_FOUND = "CHILD_NOT_FOUND";
const GROUP_NOT_FOUND = "GROUP_NOT_FOUND";

export class ChildMembershipService {
  constructor({
    childRepository,
    groupRepository,
    catalogRepository,
    authorizer,
    unitOfWork,
    clock = systemClock,
  }) {
    Object.assign(this, {
      childRepository,
      groupRepository,
      catalogRepository,
      authorizer,
      unitOfWork,
      clock,
    });
    for (const permission of [
      PERMISSIONS.CHILDREN_ENROLL,
      PERMISSIONS.CHILDREN_TRANSFER,
      PERMISSIONS.CHILDREN_UPDATE,
    ])
      authorizer.assertKnown(permission);
  }

  async validateEnrollment(child, groupId, session) {
    if (!Array.isArray(child.guardians) || child.guardians.length === 0) {
      throw new AppError(
        422,
        "GUARDIAN_REQUIRED",
        "Enrollment requires at least one guardian",
      );
    }
    const group = await this.groupRepository.findByIdForUpdate(groupId, {
      session,
    });
    if (!group)
      throw new ResourceNotFoundError(GROUP_NOT_FOUND, "Group not found");
    if (group.status !== "ACTIVE" || !group.schoolYear || !group.ageCategoryId)
      throw new AppError(
        409,
        "GROUP_NOT_READY",
        "An active, configured group is required",
      );
    const today = getCurrentCalendarDate(this.clock);
    if (getSchoolYear(today) !== group.schoolYear)
      throw new AppError(
        409,
        "GROUP_SCHOOL_YEAR_NOT_CURRENT",
        "Group must belong to the current school year",
      );
    const category = await this.catalogRepository.findById(group.ageCategoryId);
    if (!category?.active || category.kind !== CATALOG_KIND.AGE_CATEGORY)
      throw new AppError(
        409,
        "AGE_CATEGORY_NOT_ACTIVE",
        "Group age category is unavailable",
      );
    let age;
    try {
      age = calculateAgeOnSchoolYearStart(child.dateOfBirth, group.schoolYear);
    } catch (error) {
      throw new AppError(422, "CHILD_AGE_NOT_ELIGIBLE", error.message);
    }
    if (age !== category.age)
      throw new AppError(
        422,
        "CHILD_AGE_NOT_ELIGIBLE",
        "Child age does not match the group's school-year category",
      );
    return group;
  }

  async enroll(childId, groupId, actor, requestId) {
    this.authorizer.assertPermission(actor, PERMISSIONS.CHILDREN_ENROLL);
    return this.unitOfWork.execute(async ({ session, recordAudit }) => {
      const child = await this.childRepository.findByIdForUpdate(childId, {
        session,
      });
      if (!child)
        throw new ResourceNotFoundError(CHILD_NOT_FOUND, "Child not found");
      if (child.status === CHILD_STATUS.ACTIVE && child.groupId === groupId)
        return child;
      if (child.status !== CHILD_STATUS.APPLICANT)
        throw new AppError(
          409,
          "INVALID_CHILD_STATE",
          "Only an applicant can be enrolled",
        );
      const group = await this.validateEnrollment(child, groupId, session);
      const reserved = await this.groupRepository.reserveSeat(groupId, {
        session,
      });
      if (!reserved)
        throw new AppError(
          409,
          "GROUP_CAPACITY_FULL",
          "The group has no available seats",
        );
      const now = this.clock.now();
      if (child.membershipHistory.length >= CHILD_LIMITS.MAX_MEMBERSHIP_HISTORY)
        throw new AppError(
          409,
          "MEMBERSHIP_HISTORY_LIMIT",
          "Membership history limit reached",
        );
      const billingStartMonth = getBillingStartMonth(
        getCurrentCalendarDate({ now: () => now }),
      );
      const updated = await this.childRepository.updateMembershipById(
        childId,
        {
          status: CHILD_STATUS.ACTIVE,
          schoolYear: group.schoolYear,
          ageCategoryId: group.ageCategoryId,
          groupId,
          enrolledAt: now,
          billingStartMonth,
          membershipHistory: [
            ...child.membershipHistory,
            { groupId, startedAt: now },
          ],
        },
        { session },
      );
      await recordAudit({
        actorId: actor.id,
        requestId,
        action: "child.enroll",
        entityType: "CHILD",
        entityId: childId,
        after: {
          status: updated.status,
          groupId,
          schoolYear: group.schoolYear,
          billingStartMonth,
        },
        safeFields: ["status", "groupId", "schoolYear", "billingStartMonth"],
      });
      return updated;
    });
  }

  async transfer(childId, targetGroupId, actor, requestId) {
    this.authorizer.assertPermission(actor, PERMISSIONS.CHILDREN_TRANSFER);
    return this.unitOfWork.execute(async ({ session, recordAudit }) => {
      const child = await this.childRepository.findByIdForUpdate(childId, {
        session,
      });
      if (!child)
        throw new ResourceNotFoundError(CHILD_NOT_FOUND, "Child not found");
      if (
        ![CHILD_STATUS.ACTIVE, CHILD_STATUS.SUSPENDED].includes(child.status) ||
        !child.groupId
      )
        throw new AppError(
          409,
          "INVALID_CHILD_STATE",
          "Only an enrolled child can be transferred",
        );
      if (child.groupId === targetGroupId) return child;
      const target = await this.validateEnrollment(
        child,
        targetGroupId,
        session,
      );
      if (child.membershipHistory.length >= CHILD_LIMITS.MAX_MEMBERSHIP_HISTORY)
        throw new AppError(
          409,
          "MEMBERSHIP_HISTORY_LIMIT",
          "Membership history limit reached",
        );
      if (!(await this.groupRepository.releaseSeat(child.groupId, { session })))
        throw new AppError(
          409,
          "GROUP_OCCUPANCY_MISMATCH",
          "Current group occupancy could not be released",
        );
      if (!(await this.groupRepository.reserveSeat(targetGroupId, { session })))
        throw new AppError(
          409,
          "GROUP_CAPACITY_FULL",
          "The target group has no available seats",
        );
      const now = this.clock.now();
      const history = child.membershipHistory.map((entry, index) =>
        index === child.membershipHistory.length - 1 && !entry.endedAt
          ? { ...entry, endedAt: now }
          : entry,
      );
      history.push({ groupId: targetGroupId, startedAt: now });
      const updated = await this.childRepository.updateMembershipById(
        childId,
        {
          groupId: targetGroupId,
          schoolYear: target.schoolYear,
          ageCategoryId: target.ageCategoryId,
          membershipHistory: history,
        },
        { session },
      );
      await recordAudit({
        actorId: actor.id,
        requestId,
        action: "child.transfer",
        entityType: "CHILD",
        entityId: childId,
        before: {
          status: child.status,
          groupId: child.groupId,
          schoolYear: child.schoolYear ?? "",
        },
        after: {
          status: updated.status,
          groupId: targetGroupId,
          schoolYear: target.schoolYear,
          billingStartMonth: child.billingStartMonth ?? "",
        },
        safeFields: ["status", "groupId", "schoolYear", "billingStartMonth"],
      });
      return updated;
    });
  }

  async suspend(childId, actor, requestId) {
    this.authorizer.assertPermission(actor, PERMISSIONS.CHILDREN_UPDATE);
    return this.changeStatus(
      childId,
      CHILD_STATUS.SUSPENDED,
      actor,
      requestId,
      "child.suspend",
    );
  }

  async resume(childId, actor, requestId) {
    this.authorizer.assertPermission(actor, PERMISSIONS.CHILDREN_UPDATE);
    return this.changeStatus(
      childId,
      CHILD_STATUS.ACTIVE,
      actor,
      requestId,
      "child.resume",
    );
  }

  async changeStatus(childId, status, actor, requestId, action) {
    return this.unitOfWork.execute(async ({ session, recordAudit }) => {
      const child = await this.childRepository.findByIdForUpdate(childId, {
        session,
      });
      if (!child)
        throw new ResourceNotFoundError(CHILD_NOT_FOUND, "Child not found");
      if (child.status === status) return child;
      try {
        assertChildStateTransition(child.status, status);
      } catch (error) {
        throw new AppError(409, "INVALID_CHILD_STATE", error.message);
      }
      if (!child.groupId)
        throw new AppError(
          409,
          "INVALID_CHILD_STATE",
          "An enrolled group is required",
        );
      const updated = await this.childRepository.updateMembershipById(
        childId,
        { status },
        { session },
      );
      await recordAudit({
        actorId: actor.id,
        requestId,
        action,
        entityType: "CHILD",
        entityId: childId,
        before: { status: child.status },
        after: { status: updated.status },
        safeFields: ["status"],
      });
      return updated;
    });
  }
}
