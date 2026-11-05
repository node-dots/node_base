import {
  assertDateOfBirthNotInFuture,
  systemClock,
} from "../../utils/calendar.js";
import { CHILD_STATE_TRANSITIONS, CHILD_STATUS } from "./child.constants.js";
import { createChildSchema, updateChildProfileSchema } from "./child.schema.js";

export function prepareApplicant(input, { clock = systemClock } = {}) {
  const applicant = createChildSchema.parse(input);
  assertDateOfBirthNotInFuture(applicant.dateOfBirth, clock);

  return {
    ...applicant,
    status: CHILD_STATUS.APPLICANT,
    membershipHistory: [],
  };
}

export function prepareChildProfileUpdate(input, { clock = systemClock } = {}) {
  const update = updateChildProfileSchema.parse(input);
  if (update.dateOfBirth !== undefined) {
    assertDateOfBirthNotInFuture(update.dateOfBirth, clock);
  }
  return update;
}

export function assertChildStateTransition(fromStatus, toStatus) {
  const allowed = CHILD_STATE_TRANSITIONS[fromStatus];
  if (!allowed || !allowed.includes(toStatus)) {
    throw new RangeError(
      `Child state transition ${String(fromStatus)} -> ${String(toStatus)} is not allowed`,
    );
  }
  return toStatus;
}

export function assertReadyForEnrollment(child) {
  if (child.status !== CHILD_STATUS.APPLICANT) {
    throw new RangeError("Only an applicant can be enrolled");
  }
  if (!Array.isArray(child.guardians) || child.guardians.length === 0) {
    throw new RangeError("Enrollment requires at least one guardian");
  }
  return child;
}
