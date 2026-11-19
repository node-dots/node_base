import test from "node:test";
import assert from "node:assert/strict";
import {
  FIXED_DAILY_BLOCKS,
  validateSchedule,
} from "../src/modules/schedules/schedule.validator.js";

function buildSchedule(overrides = {}) {
  return {
    weekStart: "2026-11-02",
    schoolYear: "2026-2027",
    groups: [
      {
        id: "group-1",
        status: "ACTIVE",
        schoolYear: "2026-2027",
        roomId: "room-1",
        capacity: 12,
      },
    ],
    rooms: [
      { id: "room-1", active: true, roomType: "GROUP", capacity: 15 },
      { id: "room-2", active: true, roomType: "GROUP", capacity: 15 },
    ],
    teachers: [
      {
        id: "teacher-1",
        status: "ACTIVE",
        positionCode: "TEACHER",
        subjectCode: "ENGLISH",
        availability: [{ weekday: 1, startTime: "09:00", endTime: "17:00" }],
      },
      {
        id: "teacher-2",
        status: "ACTIVE",
        positionCode: "TEACHER",
        subjectCode: "MUSIC",
        availability: [{ weekday: 1, startTime: "09:00", endTime: "17:00" }],
      },
    ],
    program: [
      { subjectCode: "ENGLISH", sessionsPerWeek: 1, durationMinutes: 30 },
    ],
    slots: [
      {
        groupId: "group-1",
        roomId: "room-1",
        teacherId: "teacher-1",
        subjectCode: "ENGLISH",
        weekday: 1,
        startTime: "10:00",
        endTime: "10:30",
      },
    ],
    ...overrides,
  };
}

function codes(result) {
  return result.violations.map(({ code }) => code);
}

test("validates a complete snapshot and permits adjacent half-open sessions", () => {
  const schedule = buildSchedule({
    program: [
      { subjectCode: "ENGLISH", sessionsPerWeek: 2, durationMinutes: 30 },
    ],
    slots: [
      buildSchedule().slots[0],
      {
        ...buildSchedule().slots[0],
        startTime: "10:30",
        endTime: "11:00",
      },
    ],
  });
  assert.deepEqual(validateSchedule(schedule), { valid: true, violations: [] });
});

test("requires a Monday week and valid workday quarter-hour bounds", () => {
  const schedule = buildSchedule({
    weekStart: "2026-11-03",
    slots: [
      { ...buildSchedule().slots[0], startTime: "08:45", endTime: "09:15" },
      { ...buildSchedule().slots[0], startTime: "10:05", endTime: "10:35" },
      { ...buildSchedule().slots[0], weekday: 6 },
    ],
  });
  assert.deepEqual(codes(validateSchedule(schedule)), [
    "WEEK_START_NOT_MONDAY",
    "OUTSIDE_WORKING_GRID",
    "TEACHER_UNAVAILABLE",
    "OUTSIDE_WORKING_GRID",
    "INVALID_WEEKDAY",
    "TEACHER_UNAVAILABLE",
    "PROGRAM_SESSION_COUNT_MISMATCH",
  ]);
});

test("blocks the four fixed daily activities", () => {
  assert.deepEqual(
    FIXED_DAILY_BLOCKS.map(({ start, end }) => `${start}-${end}`),
    ["09:30-10:00", "12:00-12:30", "13:00-14:00", "15:00-15:30"],
  );
  const result = validateSchedule({
    ...buildSchedule(),
    slots: [
      {
        ...buildSchedule().slots[0],
        startTime: "13:00",
        endTime: "13:30",
      },
    ],
  });
  assert.ok(codes(result).includes("FIXED_BLOCK_CONFLICT"));
});

test("reports program omissions, extra sessions and wrong duration", () => {
  const schedule = buildSchedule({
    program: [
      { subjectCode: "ENGLISH", sessionsPerWeek: 2, durationMinutes: 45 },
      { subjectCode: "MUSIC", sessionsPerWeek: 1, durationMinutes: 30 },
    ],
    slots: [
      { ...buildSchedule().slots[0], endTime: "10:30" },
      {
        ...buildSchedule().slots[0],
        subjectCode: "CHESS",
        teacherId: "teacher-2",
        roomId: "room-2",
        startTime: "11:00",
        endTime: "11:30",
      },
    ],
  });
  assert.ok(
    codes(validateSchedule(schedule)).includes("SUBJECT_NOT_IN_PROGRAM"),
  );
  assert.ok(
    codes(validateSchedule(schedule)).includes("PROGRAM_DURATION_MISMATCH"),
  );
  assert.ok(
    codes(validateSchedule(schedule)).includes(
      "PROGRAM_SESSION_COUNT_MISMATCH",
    ),
  );
});

test("checks active school year, assigned room, capacity and teacher subject/availability", () => {
  const schedule = buildSchedule({
    groups: [
      {
        id: "group-1",
        status: "INACTIVE",
        schoolYear: "2025-2026",
        roomId: "room-2",
        capacity: 20,
      },
    ],
    rooms: [{ id: "room-1", active: false, roomType: "SERVICE", capacity: 10 }],
    teachers: [
      {
        id: "teacher-1",
        status: "TERMINATED",
        positionCode: "TEACHER",
        subjectCode: "MUSIC",
        availability: [],
      },
    ],
  });
  const resultCodes = codes(validateSchedule(schedule));
  for (const code of [
    "GROUP_NOT_ACTIVE",
    "GROUP_SCHOOL_YEAR_MISMATCH",
    "ROOM_NOT_ASSIGNED_TO_GROUP",
    "ROOM_NOT_ACTIVE",
    "ROOM_NOT_GROUP_TYPE",
    "ROOM_CAPACITY_TOO_SMALL",
    "TEACHER_NOT_ACTIVE_TEACHER",
    "TEACHER_SUBJECT_MISMATCH",
    "TEACHER_UNAVAILABLE",
  ]) {
    assert.ok(resultCodes.includes(code), code);
  }
});

test("reports resource overlaps independently and deterministically", () => {
  const slot = buildSchedule().slots[0];
  const result = validateSchedule(
    buildSchedule({
      program: [
        { subjectCode: "ENGLISH", sessionsPerWeek: 2, durationMinutes: 30 },
      ],
      slots: [slot, { ...slot }],
    }),
  );
  assert.deepEqual(codes(result), [
    "GROUP_OVERLAP",
    "ROOM_OVERLAP",
    "TEACHER_OVERLAP",
  ]);
});
