import test from "node:test";
import assert from "node:assert/strict";
import { generateScheduleDraft } from "../src/modules/schedules/schedule.generator.js";

const input = () => ({
  weekStart: "2026-11-02",
  snapshot: {
    schoolYear: "2026-2027",
    groups: [
      {
        id: "g1",
        status: "ACTIVE",
        schoolYear: "2026-2027",
        roomId: "r1",
        capacity: 12,
      },
    ],
    rooms: [{ id: "r1", active: true, roomType: "GROUP", capacity: 12 }],
    teachers: [
      {
        id: "t1",
        status: "ACTIVE",
        positionCode: "TEACHER",
        subjectCode: "MATH",
        availability: [{ weekday: 1, startTime: "09:00", endTime: "17:00" }],
      },
    ],
    program: [{ subjectCode: "MATH", sessionsPerWeek: 1, durationMinutes: 30 }],
  },
});

test("generator creates deterministic validated draft slots", async () => {
  const first = await generateScheduleDraft(input());
  const second = await generateScheduleDraft(input());
  assert.equal(first.complete, true);
  assert.deepEqual(first.slots, second.slots);
  assert.deepEqual(first.unscheduled, []);
});

test("generator returns a partial draft with budget reasons", async () => {
  let clock = 0;
  const result = await generateScheduleDraft({
    ...input(),
    now: () => clock++,
    limits: { milliseconds: 0 },
  });
  assert.equal(result.complete, false);
  assert.equal(result.unscheduled[0].reason, "BUDGET_EXHAUSTED");
  assert.equal(result.slots.length, 0);
});

test("generator enforces group and slot bounds before searching", async () => {
  await assert.rejects(
    generateScheduleDraft({ ...input(), limits: { groups: 0 } }),
    /active groups/,
  );
  await assert.rejects(
    generateScheduleDraft({ ...input(), limits: { slots: 0 } }),
    /slots/,
  );
});
