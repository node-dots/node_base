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

  async findAll({ page, pageSize }) {
    const skip = (page - 1) * pageSize;

    const groups = [...this.groups.values()].sort((a, b) =>
      a.id.localeCompare(b.id),
    );

    return {
      groups: structuredClone(groups.slice(skip, skip + pageSize)),
      total: groups.length,
    };
  }

  async findById(groupId) {
    const group = this.groups.get(groupId);
    return group ? structuredClone(group) : null;
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
  async summarizeByAge() {
    const summaries = new Map();
    for (const group of this.groups.values()) {
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
}
