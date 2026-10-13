// DTO визначає дозволені поля API незалежно від структури сховища.
export function toGroupDto(group) {
  return {
    id: group.id,
    name: group.name,
    ageCategory: group.ageCategory,
    capacity: group.capacity,
    status: group.status,
  };
}

export function toAgeSummaryDto(summary) {
  return {
    ageCategory: summary.ageCategory,
    groupsCount: summary.groupsCount,
    totalCapacity: summary.totalCapacity,
  };
}
