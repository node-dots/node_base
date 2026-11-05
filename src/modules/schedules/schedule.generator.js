import { validateSchedule } from "./schedule.validator.js";

const DEFAULT_LIMITS = Object.freeze({
  groups: 15,
  slots: 2000,
  checks: 100_000,
  milliseconds: 2000,
  batchSize: 250,
});
const minutes = (time) => {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
};
const compare = (a, b) => a.localeCompare(b);

/** Deterministic, bounded greedy placement over an explicit resource snapshot. */
export async function generateScheduleDraft({
  weekStart,
  snapshot,
  fixedSlots = [],
  limits = {},
  now = Date.now,
  yieldToEventLoop = () => new Promise((resolve) => setImmediate(resolve)),
}) {
  const budget = { ...DEFAULT_LIMITS, ...limits };
  if (
    !snapshot ||
    !Array.isArray(snapshot.groups) ||
    !Array.isArray(snapshot.rooms) ||
    !Array.isArray(snapshot.teachers) ||
    !Array.isArray(snapshot.program)
  )
    throw new TypeError("A complete schedule snapshot is required");
  const groups = [...snapshot.groups]
    .filter((g) => g.status === "ACTIVE")
    .sort((a, b) => compare(a.id, b.id));
  if (groups.length > budget.groups)
    throw new RangeError(
      `Schedule generator supports at most ${budget.groups} active groups`,
    );
  const work = [];
  for (const group of groups)
    for (const lesson of snapshot.program)
      for (let n = 0; n < lesson.sessionsPerWeek; n += 1)
        work.push({ group, lesson, occurrence: n });
  work.sort(
    (a, b) =>
      b.lesson.durationMinutes - a.lesson.durationMinutes ||
      compare(a.lesson.subjectCode, b.lesson.subjectCode) ||
      compare(a.group.id, b.group.id) ||
      a.occurrence - b.occurrence,
  );
  if (work.length + fixedSlots.length > budget.slots)
    throw new RangeError(
      `Schedule generator supports at most ${budget.slots} slots`,
    );
  const slots = fixedSlots.map((slot) => ({ ...slot }));
  const unscheduled = [];
  let checks = 0;
  let started = now();
  let exhausted = false;
  const existingCounts = new Map();
  for (const slot of slots) {
    const key = `${slot.groupId}:${slot.subjectCode}`;
    existingCounts.set(key, (existingCounts.get(key) ?? 0) + 1);
  }
  for (let index = 0; index < work.length; index += 1) {
    if (now() - started >= budget.milliseconds || checks >= budget.checks) {
      exhausted = true;
      for (const item of work.slice(index))
        unscheduled.push({
          groupId: item.group.id,
          subjectCode: item.lesson.subjectCode,
          reason: "BUDGET_EXHAUSTED",
        });
      break;
    }
    const item = work[index];
    const key = `${item.group.id}:${item.lesson.subjectCode}`;
    if ((existingCounts.get(key) ?? 0) > item.occurrence) continue;
    const room = snapshot.rooms.find(
      (r) =>
        r.id === item.group.roomId &&
        r.active &&
        r.roomType === "GROUP" &&
        r.capacity >= item.group.capacity,
    );
    const teachers = snapshot.teachers
      .filter(
        (t) =>
          t.status === "ACTIVE" &&
          t.positionCode === "TEACHER" &&
          t.subjectCode === item.lesson.subjectCode,
      )
      .sort((a, b) => {
        const load = (id) => slots.filter((s) => s.teacherId === id).length;
        return load(a.id) - load(b.id) || compare(a.id, b.id);
      });
    let placed = false;
    if (room)
      outer: for (const weekday of [1, 2, 3, 4, 5])
        for (
          let start = 9 * 60;
          start + item.lesson.durationMinutes <= 17 * 60;
          start += 15
        )
          for (const teacher of teachers) {
            checks += 1;
            if (checks % budget.batchSize === 0) await yieldToEventLoop();
            if (
              checks > budget.checks ||
              now() - started >= budget.milliseconds
            ) {
              exhausted = true;
              break outer;
            }
            const end = start + item.lesson.durationMinutes;
            const availability = (teacher.availability ?? []).some(
              (w) =>
                w.weekday === weekday &&
                minutes(w.startTime) <= start &&
                minutes(w.endTime) >= end,
            );
            if (!availability) continue;
            const candidate = {
              id: `gen-${item.group.id}-${item.lesson.subjectCode}-${item.occurrence}`,
              groupId: item.group.id,
              roomId: room.id,
              teacherId: teacher.id,
              subjectCode: item.lesson.subjectCode,
              weekday,
              startTime: `${String(Math.floor(start / 60)).padStart(2, "0")}:${String(start % 60).padStart(2, "0")}`,
              endTime: `${String(Math.floor(end / 60)).padStart(2, "0")}:${String(end % 60).padStart(2, "0")}`,
            };
            const validation = validateSchedule({
              weekStart,
              schoolYear: snapshot.schoolYear,
              groups: snapshot.groups,
              rooms: snapshot.rooms,
              teachers: snapshot.teachers,
              program: snapshot.program,
              slots: [...slots, candidate],
            });
            if (
              validation.violations.some(
                (v) =>
                  v.slotIndex === slots.length &&
                  v.code !== "PROGRAM_SESSION_COUNT_MISMATCH",
              )
            )
              continue;
            slots.push(candidate);
            existingCounts.set(key, (existingCounts.get(key) ?? 0) + 1);
            placed = true;
            break outer;
          }
    if (!placed)
      unscheduled.push({
        groupId: item.group.id,
        subjectCode: item.lesson.subjectCode,
        reason: exhausted ? "BUDGET_EXHAUSTED" : "NO_VALID_PLACEMENT_FOUND",
      });
    if ((index + 1) % budget.batchSize === 0) await yieldToEventLoop();
    if (exhausted) {
      for (const rest of work.slice(index + 1))
        unscheduled.push({
          groupId: rest.group.id,
          subjectCode: rest.lesson.subjectCode,
          reason: "BUDGET_EXHAUSTED",
        });
      break;
    }
  }
  slots.sort(
    (a, b) =>
      a.weekday - b.weekday ||
      compare(a.startTime, b.startTime) ||
      compare(a.groupId, b.groupId) ||
      compare(a.subjectCode, b.subjectCode),
  );
  const validation = validateSchedule({
    weekStart,
    schoolYear: snapshot.schoolYear,
    groups: snapshot.groups,
    rooms: snapshot.rooms,
    teachers: snapshot.teachers,
    program: snapshot.program,
    slots,
  });
  return {
    slots,
    unscheduled,
    budget: {
      checks,
      elapsedMilliseconds: Math.max(0, now() - started),
      limits: {
        groups: budget.groups,
        slots: budget.slots,
        checks: budget.checks,
        milliseconds: budget.milliseconds,
      },
    },
    complete: unscheduled.length === 0 && validation.valid,
    validation,
  };
}
