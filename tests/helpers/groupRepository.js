import { randomBytes } from "node:crypto";

// Тимчасова реалізація контракту репозиторію: дані в пам’яті процесу.
export class InMemoryGroupRepository {
  constructor(initialGroups = []) {
    this.groups = new Map();

    for (const group of initialGroups) {
      const savedGroup = {
        ...structuredClone(group),
        id: group.id ?? randomBytes(12).toString("hex"),
      };
      this.groups.set(savedGroup.id, savedGroup);
    }
  }

  async findAll({ page, pageSize, scope = { kind: "ALL" } }) {
    const skip = (page - 1) * pageSize;

    const allGroups = [...this.groups.values()].sort((a, b) =>
      a.id.localeCompare(b.id),
    );
    const groups =
      scope.kind === "ALL"
        ? allGroups
        : allGroups.filter((group) => scope.groupIds.includes(group.id));

    return {
      groups: structuredClone(groups.slice(skip, skip + pageSize)),
      total: groups.length,
    };
  }

  async findById(groupId, { scope = { kind: "ALL" } } = {}) {
    const group = this.groups.get(groupId);
    if (!group) return null;
    if (scope?.kind === "RELATED" && !scope.groupIds.includes(groupId))
      return null;
    return structuredClone(group);
  }

  async insert(group) {
    const savedGroup = {
      ...structuredClone(group),
      id: randomBytes(12).toString("hex"),
    };
    this.groups.set(savedGroup.id, savedGroup);
    return structuredClone(savedGroup);
  }
  // Справжній aggregation-pipeline перевіряємо окремо на MongoDB.
  async summarizeByAge({ scope = { kind: "ALL" } } = {}) {
    const summaries = new Map();
    for (const group of this.groups.values()) {
      if (scope?.kind === "RELATED" && !scope.groupIds.includes(group.id))
        continue;
      const entry = summaries.get(group.ageCategory) ?? {
        ageCategory: group.ageCategory,
        groupsCount: 0,
        totalCapacity: 0,
      };
      entry.groupsCount += 1;
      entry.totalCapacity += group.capacity;
      summaries.set(group.ageCategory, entry);
    }
    return [...summaries.values()].sort(
      (a, b) => a.ageCategory - b.ageCategory,
    );
  }

  async findActiveGroupIds() {
    return [];
  }
}
