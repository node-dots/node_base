import test from "node:test";
import assert from "node:assert/strict";
import { ChildMembershipService } from "../src/modules/children/childMembership.service.js";
import { authorizer } from "../src/modules/people/access/authorizer.js";
import { createFixedClock } from "../src/utils/calendar.js";

const childId = "507f1f77bcf86cd799439011";
const groupA = "507f1f77bcf86cd799439012";
const groupB = "507f1f77bcf86cd799439013";
const categoryId = "507f1f77bcf86cd799439014";
const current = () => ({
  id: childId,
  firstName: "A",
  lastName: "B",
  dateOfBirth: "2022-05-12",
  status: "APPLICANT",
  guardians: [{ personId: "507f1f77bcf86cd799439015", relationship: "parent" }],
  membershipHistory: [],
  food: {},
});

function setup({ secondCapacity = 1 } = {}) {
  const child = current();
  const groups = new Map([
    [
      groupA,
      {
        id: groupA,
        status: "ACTIVE",
        schoolYear: "2026-2027",
        ageCategoryId: categoryId,
        occupiedSeats: 0,
        capacity: 1,
      },
    ],
    [
      groupB,
      {
        id: groupB,
        status: "ACTIVE",
        schoolYear: "2026-2027",
        ageCategoryId: categoryId,
        occupiedSeats: 0,
        capacity: secondCapacity,
      },
    ],
  ]);
  const audits = [];
  const service = new ChildMembershipService({
    childRepository: {
      findByIdForUpdate: async () => structuredClone(child),
      updateMembershipById: async (_id, update) =>
        Object.assign(child, structuredClone(update)),
    },
    groupRepository: {
      findByIdForUpdate: async (id) => structuredClone(groups.get(id) ?? null),
      reserveSeat: async (id) => {
        const group = groups.get(id);
        if (
          !group ||
          group.status !== "ACTIVE" ||
          group.occupiedSeats >= group.capacity
        )
          return null;
        group.occupiedSeats += 1;
        return structuredClone(group);
      },
      releaseSeat: async (id) => {
        const group = groups.get(id);
        if (!group || group.occupiedSeats < 1) return false;
        group.occupiedSeats -= 1;
        return true;
      },
    },
    catalogRepository: {
      findById: async () => ({
        id: categoryId,
        kind: "AGE_CATEGORY",
        age: 4,
        active: true,
      }),
    },
    authorizer,
    unitOfWork: {
      execute: async (operation) => {
        const originalChild = structuredClone(child);
        const originalGroups = structuredClone([...groups]);
        const originalAuditCount = audits.length;
        try {
          return await operation({
            session: {},
            recordAudit: async (event) => audits.push(event),
          });
        } catch (error) {
          Object.assign(child, originalChild);
          groups.clear();
          for (const [id, group] of originalGroups) groups.set(id, group);
          audits.length = originalAuditCount;
          throw error;
        }
      },
    },
    clock: createFixedClock("2026-10-12T21:30:00Z"),
  });
  return { service, child, groups, audits };
}

test("enrollment is repeat-safe and billing starts the month after the server's Kyiv date", async () => {
  const state = setup();
  const actor = { id: "507f1f77bcf86cd799439016", roles: ["ADMIN"] };
  const enrolled = await state.service.enroll(childId, groupA, actor, "req-1");
  assert.equal(enrolled.status, "ACTIVE");
  assert.equal(enrolled.billingStartMonth, "2026-11");
  assert.equal(enrolled.membershipHistory.length, 1);
  await state.service.enroll(childId, groupA, actor, "req-2");
  assert.equal(state.groups.get(groupA).occupiedSeats, 1);
  assert.equal(state.audits.length, 1);
});

test("transfer moves both seats and membership interval while preserving billing start", async () => {
  const state = setup();
  const actor = { id: "507f1f77bcf86cd799439016", roles: ["ADMIN"] };
  await state.service.enroll(childId, groupA, actor, "enroll");
  const beforeBilling = state.child.billingStartMonth;
  await state.service.transfer(childId, groupB, actor, "transfer");
  assert.equal(state.groups.get(groupA).occupiedSeats, 0);
  assert.equal(state.groups.get(groupB).occupiedSeats, 1);
  assert.equal(state.child.membershipHistory.length, 2);
  assert.ok(state.child.membershipHistory[0].endedAt instanceof Date);
  assert.equal(state.child.billingStartMonth, beforeBilling);
});

test("suspension and resumption retain the seat and do not restart billing", async () => {
  const state = setup();
  const actor = { id: "507f1f77bcf86cd799439016", roles: ["ADMIN"] };
  await state.service.enroll(childId, groupA, actor, "enroll");
  const billing = state.child.billingStartMonth;
  await state.service.suspend(childId, actor, "suspend");
  assert.equal(state.groups.get(groupA).occupiedSeats, 1);
  assert.equal(state.child.status, "SUSPENDED");
  await state.service.resume(childId, actor, "resume");
  assert.equal(state.groups.get(groupA).occupiedSeats, 1);
  assert.equal(state.child.billingStartMonth, billing);
});

test("age, guardian, active-year, capacity, and history boundaries reject membership changes", async () => {
  const noGuardian = setup();
  noGuardian.child.guardians = [];
  await assert.rejects(
    () =>
      noGuardian.service.enroll(
        childId,
        groupA,
        { id: "a", roles: ["ADMIN"] },
        "r",
      ),
    { code: "GUARDIAN_REQUIRED" },
  );
  const wrongAge = setup();
  wrongAge.service.catalogRepository.findById = async () => ({
    id: categoryId,
    kind: "AGE_CATEGORY",
    age: 3,
    active: true,
  });
  await assert.rejects(
    () =>
      wrongAge.service.enroll(
        childId,
        groupA,
        { id: "a", roles: ["ADMIN"] },
        "r",
      ),
    { code: "CHILD_AGE_NOT_ELIGIBLE" },
  );
  const full = setup({ secondCapacity: 0 });
  await full.service.enroll(
    childId,
    groupA,
    { id: "a", roles: ["ADMIN"] },
    "r1",
  );
  await assert.rejects(
    () =>
      full.service.transfer(
        childId,
        groupB,
        { id: "a", roles: ["ADMIN"] },
        "r2",
      ),
    { code: "GROUP_CAPACITY_FULL" },
  );
  assert.equal(full.child.groupId, groupA);
  assert.equal(full.groups.get(groupA).occupiedSeats, 1);
});
