import test from "node:test";
import assert from "node:assert/strict";
import { authorizer } from "../src/modules/people/access/authorizer.js";
import { ScheduleService } from "../src/modules/schedules/schedule.service.js";

const weekStart = "2026-11-02";
const manager = { id: "000000000000000000000001", roles: ["MANAGER"] };
const teacher = { id: "000000000000000000000002", roles: ["TEACHER"] };
const parent = { id: "000000000000000000000003", roles: ["PARENT"] };
const slot = {
  id: "lesson-1",
  groupId: "000000000000000000000010",
  roomId: "000000000000000000000020",
  teacherId: teacher.id,
  subjectCode: "ENGLISH",
  weekday: 1,
  startTime: "10:00",
  endTime: "10:30",
};

function fixture(initial = null) {
  let current = initial;
  const repository = {
    async findDraft() {
      return current ? structuredClone(current) : null;
    },
    async updateDraft(input) {
      if ((current?.revision ?? 0) !== input.expectedRevision) return null;
      current = {
        weekStart: input.weekStart,
        revision: input.expectedRevision + 1,
        slots: structuredClone(input.slots),
        updatedById: input.updatedById,
        updatedAt: new Date("2026-11-01T12:00:00.000Z"),
      };
      return structuredClone(current);
    },
  };
  return {
    repository,
    service: new ScheduleService({
      scheduleRepository: repository,
      authorizer,
    }),
  };
}

test("draft starts at revision zero and update increments revision", async () => {
  const { service } = fixture();
  assert.deepEqual(await service.getDraft(weekStart, manager), {
    weekStart,
    revision: 0,
    slots: [],
    updatedAt: null,
  });
  const saved = await service.updateDraft(
    weekStart,
    { expectedRevision: 0, slots: [slot] },
    manager,
  );
  assert.equal(saved.revision, 1);
  assert.deepEqual(saved.slots, [slot]);
});

test("stale revision is rejected and leaves the saved draft unchanged", async () => {
  const initial = {
    weekStart,
    revision: 3,
    slots: [slot],
    updatedById: manager.id,
    updatedAt: new Date("2026-11-01T12:00:00.000Z"),
  };
  const { service } = fixture(initial);
  service.scheduleRepository.updateDraft = async () => null;
  await assert.rejects(
    service.updateDraft(weekStart, { expectedRevision: 3, slots: [] }, manager),
    { code: "SCHEDULE_REVISION_CONFLICT" },
  );
  assert.deepEqual(await service.getDraft(weekStart, manager), initial);
});

test("teacher may update only time on own slots, not assignments or other teachers' slots", async () => {
  const initial = {
    weekStart,
    revision: 2,
    slots: [slot],
    updatedById: manager.id,
    updatedAt: new Date("2026-11-01T12:00:00.000Z"),
  };
  const { service } = fixture(initial);
  const timeOnly = { ...slot, startTime: "10:30", endTime: "11:00" };
  assert.equal(
    (
      await service.updateDraft(
        weekStart,
        { expectedRevision: 2, slots: [timeOnly] },
        teacher,
      )
    ).revision,
    3,
  );
  await assert.rejects(
    service.updateDraft(
      weekStart,
      {
        expectedRevision: 3,
        slots: [{ ...timeOnly, groupId: "000000000000000000000099" }],
      },
      teacher,
    ),
    { code: "SCHEDULE_SLOT_SCOPE_FORBIDDEN" },
  );
  await assert.rejects(
    service.updateDraft(weekStart, { expectedRevision: 3, slots: [] }, teacher),
    { code: "SCHEDULE_SLOT_SCOPE_FORBIDDEN" },
  );
});

test("parent cannot read or edit a draft", async () => {
  const { service } = fixture();
  await assert.rejects(service.getDraft(weekStart, parent), {
    code: "FORBIDDEN",
  });
  await assert.rejects(
    service.updateDraft(weekStart, { expectedRevision: 0, slots: [] }, parent),
    { code: "FORBIDDEN" },
  );
});

test("draft schema rejects unknown fields, duplicate slot IDs and 2001 slots", async () => {
  const { service } = fixture();
  await assert.rejects(
    service.updateDraft(
      weekStart,
      { expectedRevision: 0, slots: [], extra: true },
      manager,
    ),
    { code: "INVALID_SCHEDULE_DRAFT" },
  );
  await assert.rejects(
    service.updateDraft(
      weekStart,
      { expectedRevision: 0, slots: [slot, slot] },
      manager,
    ),
    { code: "INVALID_SCHEDULE_DRAFT" },
  );
  await assert.rejects(
    service.updateDraft(
      weekStart,
      {
        expectedRevision: 0,
        slots: Array.from({ length: 2001 }, (_, i) => ({
          ...slot,
          id: `slot-${i}`,
        })),
      },
      manager,
    ),
    { code: "INVALID_SCHEDULE_DRAFT" },
  );
});
