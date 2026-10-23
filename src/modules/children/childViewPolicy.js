import { ROLES } from "../../utils/access/roles.js";
import { PERMISSIONS } from "../../utils/access/permissions.js";

function baseDto(child) {
  return {
    id: child.id,
    firstName: child.firstName,
    lastName: child.lastName,
    middleName: child.middleName,
    dateOfBirth: child.dateOfBirth,
    status: child.status,
    ...(child.groupId ? { groupId: child.groupId } : {}),
  };
}

export class ChildViewPolicy {
  constructor({ authorizer }) {
    this.authorizer = authorizer;
    this.authorizer.assertKnown(PERMISSIONS.CHILDREN_READ);
  }

  toReadDto(child, actor) {
    this.authorizer.assertPermission(actor, PERMISSIONS.CHILDREN_READ);
    const dto = baseDto(child);
    const isGuardian =
      actor.roles.includes(ROLES.PARENT) &&
      (child.guardians ?? []).some(
        (guardian) => guardian.personId === actor.id,
      );

    if (
      isGuardian ||
      actor.roles.includes(ROLES.ADMIN) ||
      actor.roles.includes(ROLES.MANAGER)
    ) {
      return {
        ...dto,
        guardians: structuredClone(child.guardians ?? []),
        relatives: structuredClone(child.relatives ?? []),
        food: structuredClone(child.food ?? {}),
        ...(child.benefitCode ? { benefitCode: child.benefitCode } : {}),
        ...(child.membershipHistory
          ? { membershipHistory: structuredClone(child.membershipHistory) }
          : {}),
      };
    }

    if (
      actor.roles.includes(ROLES.EDUCATOR) ||
      actor.roles.includes(ROLES.ASSISTANT)
    ) {
      return {
        ...dto,
        food: {
          exclusions: [...(child.food?.exclusions ?? [])],
          allergyNotes: [...(child.food?.allergyNotes ?? [])],
        },
      };
    }
    return dto;
  }
}
