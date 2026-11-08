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

test("generation requires its dedicated permission and saves a draft without publishing", async () => {
  let published = false;
  const { service, repository } = fixture();
  service.snapshotProvider = {
    async read() {
      return {
        schoolYear: "2026-2027",
        groups: [
          {
            id: slot.groupId,
            status: "ACTIVE",
            schoolYear: "2026-2027",
            roomId: slot.roomId,
            capacity: 10,
          },
        ],
        rooms: [
          { id: slot.roomId, active: true, roomType: "GROUP", capacity: 10 },
        ],
        teachers: [
          {
            id: slot.teacherId,
            status: "ACTIVE",
            positionCode: "TEACHER",
            subjectCode: "ENGLISH",
            availability: [
              { weekday: 1, startTime: "09:00", endTime: "17:00" },
            ],
          },
        ],
        program: [
          { subjectCode: "ENGLISH", sessionsPerWeek: 1, durationMinutes: 30 },
        ],
      };
    },
  };
  repository.publish = async () => {
    published = true;
  };
  const result = await service.generateDraft(
    weekStart,
    { expectedRevision: 0, fixedSlots: [] },
    manager,
  );
  assert.equal(result.complete, true);
  assert.equal(result.draft.revision, 1);
  assert.equal(result.draft.slots.length, 1);
  assert.equal(published, false);
  await assert.rejects(
    service.generateDraft(
      weekStart,
      { expectedRevision: 1, fixedSlots: [] },
      teacher,
    ),
    { status: 403 },
  );
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

test("publishes only a valid revision in range and returns an immutable snapshot", async () => {
  const publishedEvents = [];
  const draft = {
    weekStart,
    revision: 3,
    slots: [slot],
    updatedById: manager.id,
    updatedAt: new Date("2026-11-01T12:00:00.000Z"),
  };
  const service = new ScheduleService({
    scheduleRepository: {
      async findDraft() {
        return structuredClone(draft);
      },
      async publish(input) {
        publishedEvents.push(input);
        return {
          weekStart,
          revision: 3,
          slots: [slot],
          updatedById: manager.id,
          updatedAt: draft.updatedAt,
          published: input.published,
        };
      },
    },
    authorizer,
    clock: { now: () => new Date("2026-10-26T08:00:00.000Z") },
    unitOfWork: {
      async execute(operation) {
        return operation({
          session: {},
          recordAudit: async (event) => publishedEvents.push(event),
        });
      },
    },
    catalogRepository: {
      async ensureScheduleResourceGuard() {},
      async incrementScheduleResourceGuard() {
        return { revision: 9 };
      },
    },
    snapshotProvider: {
      async read() {
        return {
          schoolYear: "2026-2027",
          groups: [
            {
              id: slot.groupId,
              status: "ACTIVE",
              schoolYear: "2026-2027",
              roomId: slot.roomId,
              capacity: 10,
            },
          ],
          rooms: [
            { id: slot.roomId, active: true, roomType: "GROUP", capacity: 15 },
          ],
          teachers: [
            {
              id: slot.teacherId,
              status: "ACTIVE",
              positionCode: "TEACHER",
              subjectCode: "ENGLISH",
              availability: [
                { weekday: 1, startTime: "09:00", endTime: "17:00" },
              ],
            },
          ],
          program: [
            { subjectCode: "ENGLISH", sessionsPerWeek: 1, durationMinutes: 30 },
          ],
        };
      },
    },
  });
  const result = await service.publish(
    weekStart,
    { expectedRevision: 3 },
    manager,
    "publish-request",
  );
  assert.equal(result.revision, 3);
  assert.equal(result.resourceRevision, 9);
  assert.deepEqual(result.slots, [slot]);
  assert.equal(publishedEvents[0].published.resourceRevision, 9);
  assert.equal(publishedEvents[1].action, "schedule.publish");
  await assert.rejects(
    service.publish("2026-12-07", { expectedRevision: 3 }, manager, "late"),
    { code: "SCHEDULE_PUBLICATION_OUT_OF_RANGE" },
  );
});

test("failed publication validation does not save a published snapshot", async () => {
  let saved = false;
  const service = new ScheduleService({
    scheduleRepository: {
      async findDraft() {
        return {
          weekStart,
          revision: 1,
          slots: [slot],
          updatedById: manager.id,
        };
      },
      async publish() {
        saved = true;
      },
    },
    authorizer,
    clock: { now: () => new Date("2026-10-26T08:00:00.000Z") },
    unitOfWork: {
      async execute(operation) {
        return operation({ session: {}, recordAudit: async () => {} });
      },
    },
    catalogRepository: {
      async ensureScheduleResourceGuard() {},
      async incrementScheduleResourceGuard() {
        return { revision: 1 };
      },
    },
    snapshotProvider: {
      async read() {
        return {
          schoolYear: "2026-2027",
          groups: [],
          rooms: [],
          teachers: [],
          program: [],
        };
      },
    },
  });
  await assert.rejects(
    service.publish(weekStart, { expectedRevision: 1 }, manager, "bad-publish"),
    { code: "SCHEDULE_NOT_PUBLISHABLE" },
  );
  assert.equal(saved, false);
});

test("published schedule reads are filtered to guardian groups and teacher slots", async () => {
  const published = {
    revision: 3,
    publishedAt: new Date("2026-10-26T08:00:00.000Z"),
    publishedById: manager.id,
    resourceRevision: 9,
    slots: [
      slot,
      {
        ...slot,
        id: "other",
        teacherId: "other-teacher",
        groupId: "other-group",
      },
    ],
  };
  const service = new ScheduleService({
    scheduleRepository: {
      async findPublished() {
        return { weekStart, published };
      },
    },
    authorizer,
    guardianGroupsReader: {
      async findActiveGroupIds() {
        return [slot.groupId];
      },
    },
  });
  assert.deepEqual((await service.getPublished(weekStart, parent)).slots, [
    slot,
  ]);
  assert.deepEqual((await service.getPublished(weekStart, teacher)).slots, [
    slot,
  ]);
});
