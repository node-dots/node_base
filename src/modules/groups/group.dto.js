// DTO визначає дозволені поля API незалежно від структури сховища.
export function toGroupDto(group) {
  return {
    id: group.id,
    name: group.name,
    ageCategory: group.ageCategory,
    capacity: group.capacity,
    status: group.status,
    ...(group.schoolYear ? { schoolYear: group.schoolYear } : {}),
    ...(group.ageCategoryId ? { ageCategoryId: group.ageCategoryId } : {}),
    ...(group.roomId ? { roomId: group.roomId } : {}),
    ...(group.educatorId ? { educatorId: group.educatorId } : {}),
    ...(group.assistantId ? { assistantId: group.assistantId } : {}),
    occupiedSeats: group.occupiedSeats ?? 0,
  };
}

export function toAgeSummaryDto(summary) {
  return {
    ageCategory: summary.ageCategory,
    groupsCount: summary.groupsCount,
    totalCapacity: summary.totalCapacity,
  };
}
