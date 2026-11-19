const DAY_START = 9 * 60;
const DAY_END = 17 * 60;
const GRID_MINUTES = 15;

export const FIXED_DAILY_BLOCKS = Object.freeze([
  Object.freeze({ start: "09:30", end: "10:00", code: "BREAKFAST" }),
  Object.freeze({ start: "12:00", end: "12:30", code: "LUNCH" }),
  Object.freeze({ start: "13:00", end: "14:00", code: "NAP" }),
  Object.freeze({ start: "15:00", end: "15:30", code: "AFTERNOON_SNACK" }),
]);

function minutes(time) {
  if (typeof time !== "string" || !/^\d{2}:\d{2}$/.test(time)) return null;
  const [hours, minute] = time.split(":").map(Number);
  if (hours > 23 || minute > 59) return null;
  return hours * 60 + minute;
}

function isMonday(date) {
  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date))
    return false;
  const parsed = new Date(`${date}T00:00:00Z`);
  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === date &&
    parsed.getUTCDay() === 1
  );
}

function overlaps(start, end, otherStart, otherEnd) {
  return start < otherEnd && otherStart < end;
}

function isWithinAvailability(teacher, weekday, start, end) {
  return (teacher.availability ?? []).some((window) => {
    const windowStart = minutes(window.startTime);
    const windowEnd = minutes(window.endTime);
    return (
      window.weekday === weekday &&
      windowStart !== null &&
      windowEnd !== null &&
      windowStart <= start &&
      end <= windowEnd
    );
  });
}

function byId(items, type, violations) {
  const map = new Map();
  for (const [index, item] of items.entries()) {
    if (!item || typeof item.id !== "string" || item.id.length === 0) {
      violations.push({
        code: `INVALID_${type.toUpperCase()}_SNAPSHOT`,
        index,
      });
      continue;
    }
    if (map.has(item.id)) {
      violations.push({
        code: `DUPLICATE_${type.toUpperCase()}_SNAPSHOT`,
        id: item.id,
      });
      continue;
    }
    map.set(item.id, item);
  }
  return map;
}

function violation(code, slotIndex, slot, details = {}) {
  return {
    code,
    ...(Number.isInteger(slotIndex) ? { slotIndex } : {}),
    ...(slot?.groupId ? { groupId: slot.groupId } : {}),
    ...details,
  };
}

/**
 * Validate a complete weekly draft against immutable resource and program snapshots.
 * Expected shapes: groups[{id,status,schoolYear,roomId}],
 * rooms[{id,active,roomType,capacity}],
 * teachers[{id,status,positionCode,subjectCode,availability}],
 * program[{subjectCode,sessionsPerWeek,durationMinutes}],
 * slots[{groupId,roomId,teacherId,subjectCode,weekday,startTime,endTime}].
 */
export function validateSchedule(input) {
  const violations = [];
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { valid: false, violations: [{ code: "INVALID_INPUT" }] };
  }
  const { weekStart, schoolYear, slots, groups, rooms, teachers, program } =
    input;
  if (!isMonday(weekStart)) violations.push({ code: "WEEK_START_NOT_MONDAY" });
  if (typeof schoolYear !== "string" || !/^\d{4}-\d{4}$/.test(schoolYear))
    violations.push({ code: "INVALID_SCHOOL_YEAR" });
  if (!Array.isArray(slots)) violations.push({ code: "INVALID_SLOTS" });
  if (!Array.isArray(groups)) violations.push({ code: "INVALID_GROUPS" });
  if (!Array.isArray(rooms)) violations.push({ code: "INVALID_ROOMS" });
  if (!Array.isArray(teachers)) violations.push({ code: "INVALID_TEACHERS" });
  if (!Array.isArray(program) || program.length === 0)
    violations.push({ code: "INVALID_PROGRAM" });
  if (
    !Array.isArray(slots) ||
    !Array.isArray(groups) ||
    !Array.isArray(rooms) ||
    !Array.isArray(teachers) ||
    !Array.isArray(program)
  ) {
    return { valid: false, violations };
  }

  const groupsById = byId(groups, "group", violations);
  const roomsById = byId(rooms, "room", violations);
  const teachersById = byId(teachers, "teacher", violations);
  const lessonsBySubject = new Map();
  for (const [index, lesson] of program.entries()) {
    if (
      !lesson ||
      typeof lesson.subjectCode !== "string" ||
      !Number.isSafeInteger(lesson.sessionsPerWeek) ||
      lesson.sessionsPerWeek < 1 ||
      !Number.isSafeInteger(lesson.durationMinutes) ||
      lesson.durationMinutes < GRID_MINUTES ||
      lesson.durationMinutes % GRID_MINUTES !== 0
    ) {
      violations.push({ code: "INVALID_PROGRAM_LESSON", index });
      continue;
    }
    if (lessonsBySubject.has(lesson.subjectCode)) {
      violations.push({
        code: "DUPLICATE_PROGRAM_SUBJECT",
        subjectCode: lesson.subjectCode,
      });
      continue;
    }
    lessonsBySubject.set(lesson.subjectCode, lesson);
  }

  const slotsByGroupSubject = new Map();
  for (const [slotIndex, slot] of slots.entries()) {
    if (!slot || typeof slot !== "object" || Array.isArray(slot)) {
      violations.push(violation("INVALID_SLOT", slotIndex));
      continue;
    }
    const start = minutes(slot.startTime);
    const end = minutes(slot.endTime);
    if (!Number.isInteger(slot.weekday) || slot.weekday < 1 || slot.weekday > 5)
      violations.push(violation("INVALID_WEEKDAY", slotIndex, slot));
    if (start === null || end === null || start >= end) {
      violations.push(violation("INVALID_TIME_RANGE", slotIndex, slot));
      continue;
    }
    if (
      start < DAY_START ||
      end > DAY_END ||
      start % GRID_MINUTES !== 0 ||
      end % GRID_MINUTES !== 0
    ) {
      violations.push(violation("OUTSIDE_WORKING_GRID", slotIndex, slot));
    }

    const group = groupsById.get(slot.groupId);
    const room = roomsById.get(slot.roomId);
    const teacher = teachersById.get(slot.teacherId);
    if (!group) violations.push(violation("GROUP_NOT_FOUND", slotIndex, slot));
    else {
      if (group.status !== "ACTIVE")
        violations.push(violation("GROUP_NOT_ACTIVE", slotIndex, slot));
      if (group.schoolYear !== schoolYear)
        violations.push(
          violation("GROUP_SCHOOL_YEAR_MISMATCH", slotIndex, slot),
        );
      if (group.roomId !== slot.roomId)
        violations.push(
          violation("ROOM_NOT_ASSIGNED_TO_GROUP", slotIndex, slot),
        );
      const key = `${group.id}:${slot.subjectCode}`;
      slotsByGroupSubject.set(key, (slotsByGroupSubject.get(key) ?? 0) + 1);
    }
    if (!room) violations.push(violation("ROOM_NOT_FOUND", slotIndex, slot));
    else {
      if (room.active !== true)
        violations.push(violation("ROOM_NOT_ACTIVE", slotIndex, slot));
      if (room.roomType !== "GROUP")
        violations.push(violation("ROOM_NOT_GROUP_TYPE", slotIndex, slot));
      if (
        group &&
        (!Number.isSafeInteger(room.capacity) || room.capacity < group.capacity)
      )
        violations.push(violation("ROOM_CAPACITY_TOO_SMALL", slotIndex, slot));
    }
    if (!teacher)
      violations.push(violation("TEACHER_NOT_FOUND", slotIndex, slot));
    else {
      if (teacher.status !== "ACTIVE" || teacher.positionCode !== "TEACHER")
        violations.push(
          violation("TEACHER_NOT_ACTIVE_TEACHER", slotIndex, slot),
        );
      if (teacher.subjectCode !== slot.subjectCode)
        violations.push(violation("TEACHER_SUBJECT_MISMATCH", slotIndex, slot));
      if (!isWithinAvailability(teacher, slot.weekday, start, end))
        violations.push(violation("TEACHER_UNAVAILABLE", slotIndex, slot));
    }
    const lesson = lessonsBySubject.get(slot.subjectCode);
    if (!lesson)
      violations.push(violation("SUBJECT_NOT_IN_PROGRAM", slotIndex, slot));
    else if (end - start !== lesson.durationMinutes)
      violations.push(
        violation("PROGRAM_DURATION_MISMATCH", slotIndex, slot, {
          expectedMinutes: lesson.durationMinutes,
        }),
      );

    for (const block of FIXED_DAILY_BLOCKS) {
      if (
        Number.isInteger(slot.weekday) &&
        overlaps(start, end, minutes(block.start), minutes(block.end))
      ) {
        violations.push(
          violation("FIXED_BLOCK_CONFLICT", slotIndex, slot, {
            block: block.code,
          }),
        );
      }
    }
    for (let priorIndex = 0; priorIndex < slotIndex; priorIndex += 1) {
      const prior = slots[priorIndex];
      if (!prior || prior.weekday !== slot.weekday) continue;
      const priorStart = minutes(prior.startTime);
      const priorEnd = minutes(prior.endTime);
      if (
        priorStart === null ||
        priorEnd === null ||
        !overlaps(start, end, priorStart, priorEnd)
      )
        continue;
      if (prior.groupId === slot.groupId)
        violations.push(violation("GROUP_OVERLAP", slotIndex, slot));
      if (prior.roomId === slot.roomId)
        violations.push(violation("ROOM_OVERLAP", slotIndex, slot));
      if (prior.teacherId === slot.teacherId)
        violations.push(violation("TEACHER_OVERLAP", slotIndex, slot));
    }
  }

  for (const group of groups) {
    if (!group || group.status !== "ACTIVE") continue;
    for (const [subjectCode, lesson] of lessonsBySubject) {
      const actual = slotsByGroupSubject.get(`${group.id}:${subjectCode}`) ?? 0;
      if (actual !== lesson.sessionsPerWeek) {
        violations.push({
          code: "PROGRAM_SESSION_COUNT_MISMATCH",
          groupId: group.id,
          subjectCode,
          expected: lesson.sessionsPerWeek,
          actual,
        });
      }
    }
  }

  return { valid: violations.length === 0, violations };
}
