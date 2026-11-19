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
  const invoices = [];
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
    invoiceRepository: {
      async cancelAfterBillingEnd(_childId, billingEndMonth, withdrawnAt) {
        let obligationCents = 0;
        let paidAmountCents = 0;
        for (const invoice of invoices) {
          paidAmountCents += invoice.paidAmountCents;
          invoice.parts = invoice.parts.map((part) => {
            if (part.month < billingEndMonth && !part.cancelled)
              obligationCents += part.amountCents;
            if (part.month >= billingEndMonth && !part.cancelled)
              return {
                ...part,
                remainingCents: 0,
                cancelled: true,
                cancelledAt: withdrawnAt,
              };
            return part;
          });
          invoice.remainingAmountCents = invoice.parts.reduce(
            (sum, part) => sum + part.remainingCents,
            0,
          );
          if (invoice.parts.every((part) => part.cancelled))
            invoice.status = "CANCELLED";
        }
        return {
          billingEndMonth,
          obligationCents,
          paidAmountCents,
          refundDueCents: Math.max(0, paidAmountCents - obligationCents),
          cancelledInvoiceIds: [],
          cancelledParts: 0,
        };
      },
    },
    authorizer,
    unitOfWork: {
      execute: async (operation) => {
        const originalChild = structuredClone(child);
        const originalGroups = structuredClone([...groups]);
        const originalAuditCount = audits.length;
        const originalInvoices = structuredClone(invoices);
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
          invoices.splice(0, invoices.length, ...originalInvoices);
          throw error;
        }
      },
    },
    clock: createFixedClock("2026-10-12T21:30:00Z"),
  });
  return { service, child, groups, audits, invoices };
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

test("withdrawal releases one seat, cancels future annual parts and returns the exact refund due", async () => {
  const state = setup();
  const actor = { id: "507f1f77bcf86cd799439016", roles: ["ADMIN"] };
  await state.service.enroll(childId, groupA, actor, "enroll");
  state.service.clock = createFixedClock("2027-01-12T12:00:00.000Z");
  state.invoices.push({
    id: "annual-1",
    status: "PAID",
    paidAmountCents: 14_256_000,
    origAmountCents: 14_256_000,
    remainingAmountCents: 0,
    parts: Array.from({ length: 12 }, (_, index) => {
      const month = new Date(Date.UTC(2026, 10 + index, 1))
        .toISOString()
        .slice(0, 7);
      return { month, amountCents: 1_188_000, remainingCents: 0 };
    }),
  });

  const result = await state.service.withdraw(childId, actor, "withdraw");
  assert.equal(result.child.status, "LEFT");
  assert.equal(result.child.groupId, null);
  assert.equal(result.billing.billingEndMonth, "2027-02");
  assert.equal(result.billing.obligationCents, 3_564_000);
  assert.equal(result.billing.refundDueCents, 10_692_000);
  assert.equal(state.invoices[0].origAmountCents, 14_256_000);
  assert.equal(state.invoices[0].parts[3].cancelled, true);
  assert.equal(state.invoices[0].parts[3].amountCents, 1_188_000);
  assert.equal(state.groups.get(groupA).occupiedSeats, 0);
  const repeat = await state.service.withdraw(
    childId,
    actor,
    "withdraw-repeat",
  );
  assert.equal(repeat.repeated, true);
  assert.equal(state.groups.get(groupA).occupiedSeats, 0);
  assert.equal(
    state.audits.filter(({ action }) => action === "child.withdraw").length,
    1,
  );
});

test("withdrawal before first billed month has no obligation", async () => {
  const state = setup();
  const actor = { id: "507f1f77bcf86cd799439016", roles: ["ADMIN"] };
  await state.service.enroll(childId, groupA, actor, "enroll");
  state.invoices.push({
    id: "future-month",
    status: "OPEN",
    paidAmountCents: 0,
    origAmountCents: 1_500_000,
    remainingAmountCents: 1_500_000,
    parts: [
      { month: "2026-11", amountCents: 1_500_000, remainingCents: 1_500_000 },
    ],
  });
  const result = await state.service.withdraw(childId, actor, "withdraw");
  assert.equal(result.billing.billingEndMonth, "2026-11");
  assert.equal(result.billing.obligationCents, 0);
  assert.equal(result.billing.refundDueCents, 0);
  assert.equal(state.invoices[0].status, "CANCELLED");
  assert.equal(state.groups.get(groupA).occupiedSeats, 0);
});

test("withdrawal rolls back membership, seat and billing cancellation if audit fails", async () => {
  const state = setup();
  const actor = { id: "507f1f77bcf86cd799439016", roles: ["ADMIN"] };
  await state.service.enroll(childId, groupA, actor, "enroll");
  state.invoices.push({
    id: "future-month",
    status: "OPEN",
    paidAmountCents: 0,
    origAmountCents: 1_500_000,
    remainingAmountCents: 1_500_000,
    parts: [
      { month: "2026-11", amountCents: 1_500_000, remainingCents: 1_500_000 },
    ],
  });
  const originalAudit = state.service.unitOfWork.execute;
  state.service.unitOfWork.execute = async (operation) => {
    const originalRecordAudit = state.audits.push.bind(state.audits);
    try {
      return await originalAudit(async (context) =>
        operation({
          ...context,
          recordAudit: async () => {
            throw new Error("audit unavailable");
          },
        }),
      );
    } finally {
      state.audits.push = originalRecordAudit;
    }
  };
  await assert.rejects(
    state.service.withdraw(childId, actor, "withdraw"),
    /audit unavailable/,
  );
  assert.equal(state.child.status, "ACTIVE");
  assert.equal(state.groups.get(groupA).occupiedSeats, 1);
  assert.equal(state.invoices[0].status, "OPEN");
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
