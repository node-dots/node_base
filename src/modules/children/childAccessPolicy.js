import { ROLES } from "../../utils/access/roles.js";

export class ChildAccessPolicy {
  constructor({ groupAssignmentsReader }) {
    this.groupAssignmentsReader = groupAssignmentsReader;
  }

  async readScope(actor) {
    if (
      actor.roles.includes(ROLES.ADMIN) ||
      actor.roles.includes(ROLES.MANAGER)
    ) {
      return { kind: "ALL" };
    }
    const positions = [];
    if (actor.roles.includes(ROLES.EDUCATOR)) positions.push("educator");
    if (actor.roles.includes(ROLES.ASSISTANT)) positions.push("assistant");
    const groupIds = positions.length
      ? await this.groupAssignmentsReader.findActiveGroupIds({
          personId: actor.id,
          positions,
        })
      : [];
    return {
      kind: "RELATED",
      guardianId: actor.roles.includes(ROLES.PARENT) ? actor.id : null,
      groupIds: [...new Set(groupIds)],
    };
  }
}

export function childScopeFilter(scope) {
  if (scope?.kind === "ALL") return {};
  if (scope?.kind !== "RELATED" || !Array.isArray(scope.groupIds)) {
    throw new TypeError("Невідома область доступу до дітей");
  }
  const alternatives = [];
  if (scope.guardianId) {
    alternatives.push({
      "guardians.personId": scope.guardianId,
    });
  }
  const validIds = scope.groupIds.filter((id) => /^[a-f\d]{24}$/i.test(id));
  if (validIds.length) alternatives.push({ groupId: { $in: validIds } });
  return alternatives.length ? { $or: alternatives } : { _id: { $in: [] } };
}
