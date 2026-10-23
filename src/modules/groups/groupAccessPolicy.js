import mongoose from "mongoose";
import { ROLES } from "../../utils/access/roles.js";

export class GroupAccessPolicy {
  constructor({ groupAssignmentsReader, guardianGroupsReader }) {
    this.groupAssignmentsReader = groupAssignmentsReader;
    this.guardianGroupsReader = guardianGroupsReader;
  }

  async readScope(actor) {
    if (
      actor.roles.includes(ROLES.ADMIN) ||
      actor.roles.includes(ROLES.MANAGER)
    ) {
      return { kind: "ALL" };
    }

    const groupIds = new Set();
    if (actor.roles.includes(ROLES.PARENT)) {
      for (const id of await this.guardianGroupsReader.findActiveGroupIds(
        actor.id,
      )) {
        groupIds.add(id);
      }
    }

    const positions = [];
    if (actor.roles.includes(ROLES.EDUCATOR)) positions.push("educator");
    if (actor.roles.includes(ROLES.ASSISTANT)) positions.push("assistant");
    if (positions.length > 0) {
      const assigned = await this.groupAssignmentsReader.findActiveGroupIds({
        personId: actor.id,
        positions,
      });
      for (const id of assigned) groupIds.add(id);
    }

    return { kind: "RELATED", groupIds: [...groupIds] };
  }
}

export function groupScopeFilter(scope) {
  if (scope?.kind === "ALL") return {};
  if (scope?.kind !== "RELATED" || !Array.isArray(scope.groupIds)) {
    throw new TypeError("Невідома область доступу до груп");
  }
  const ids = scope.groupIds.filter((id) => mongoose.isObjectIdOrHexString(id));
  return ids.length > 0
    ? { _id: { $in: ids.map((id) => new mongoose.Types.ObjectId(id)) } }
    : { _id: { $in: [] } };
}
