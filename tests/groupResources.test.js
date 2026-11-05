import test from "node:test";
import assert from "node:assert/strict";
import { GroupService } from "../src/modules/groups/group.service.js";
import { authorizer } from "../src/modules/people/access/authorizer.js";

const groupId = "507f1f77bcf86cd799439011";
const categoryId = "507f1f77bcf86cd799439012";
const roomId = "507f1f77bcf86cd799439013";
const educatorId = "507f1f77bcf86cd799439014";
const assistantId = "507f1f77bcf86cd799439015";
const resources = {
  schoolYear: "2026-2027",
  ageCategoryId: categoryId,
  roomId,
  educatorId,
  assistantId,
  capacity: 16,
};

function makeService({ conflicts = [], occupiedSeats = 0 } = {}) {
  const stored = {
    id: groupId,
    name: "Group",
    ageCategory: 3,
    capacity: 18,
    status: "DRAFT",
    occupiedSeats: 0,
  };
  const events = [];
  return {
    events,
    service: new GroupService({
      groupRepository: {
        findByIdForUpdate: async () => structuredClone(stored),
        findActiveResourceConflicts: async () => conflicts,
        updateById: async (_id, update) =>
          Object.assign(stored, structuredClone(update)),
      },
      authorizer,
      groupAccessPolicy: {},
      catalogRepository: {
        ensureEmployeeResourceGuard: async () => {},
        incrementEmployeeResourceGuard: async () => {},
        findById: async (id) =>
          id === categoryId
            ? { id, kind: "AGE_CATEGORY", age: 3, active: true }
            : {
                id,
                kind: "ROOM",
                roomType: "GROUP",
                capacity: 20,
                active: true,
              },
      },
      personRepository: {
        findById: async (id) => ({
          id,
          status: "ACTIVE",
          employee: {
            positionCode: id === educatorId ? "EDUCATOR" : "ASSISTANT",
            status: "ACTIVE",
          },
        }),
      },
      childRepository: { countOccupiedByGroup: async () => occupiedSeats },
      unitOfWork: {
        execute: async (operation) =>
          operation({
            session: {},
            recordAudit: async (event) => events.push(event),
          }),
      },
    }),
  };
}

test("group activation verifies room, category and distinct active employee assignments", async () => {
  const setup = makeService();
  const result = await setup.service.updateResources(
    groupId,
    resources,
    { id: educatorId, roles: ["ADMIN"] },
    "request-id",
  );
  assert.equal(result.status, "ACTIVE");
  assert.equal(result.occupiedSeats, 0);
  assert.equal(result.ageCategory, 3);
  assert.equal(setup.events[0].action, "group.resources.update");
});

test("group resource validation rejects cross-resource conflicts and undersized capacity", async () => {
  const conflicting = makeService({
    conflicts: [{ _id: "group-two" }],
  }).service;
  await assert.rejects(
    () =>
      conflicting.updateResources(
        groupId,
        resources,
        { id: educatorId, roles: ["ADMIN"] },
        "r",
      ),
    { code: "GROUP_RESOURCE_CONFLICT" },
  );
  const occupied = makeService({ occupiedSeats: 17 }).service;
  await assert.rejects(
    () =>
      occupied.updateResources(
        groupId,
        { ...resources, capacity: 16 },
        { id: educatorId, roles: ["ADMIN"] },
        "r",
      ),
    { code: "CAPACITY_BELOW_OCCUPANCY" },
  );
});

test("the same employee cannot hold educator and assistant positions", async () => {
  const setup = makeService().service;
  await assert.rejects(
    () =>
      setup.updateResources(
        groupId,
        { ...resources, assistantId: educatorId },
        { id: educatorId, roles: ["ADMIN"] },
        "r",
      ),
    { code: "GROUP_STAFF_MUST_DIFFER" },
  );
});
