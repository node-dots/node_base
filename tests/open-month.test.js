import test from "node:test";
import assert from "node:assert/strict";
import { OpenMonthService } from "../src/modules/expenses/openMonth.service.js";
import { authorizer } from "../src/modules/people/access/authorizer.js";

test("opening month snapshots rent, assigned salary, actual occupied seats and returns it unchanged", async () => {
  const marker = new Map();
  const expenses = new Map();
  const employees = [
    { id: "edu", employee: { positionCode: "EDUCATOR", salaryMinor: 1 } },
    { id: "asst", employee: { positionCode: "ASSISTANT", salaryMinor: 1 } },
    {
      id: "teacher",
      employee: { positionCode: "TEACHER", salaryMinor: 2_400_000 },
    },
  ];
  const dependencies = {
    expenseRepository: {
      async insert(value) {
        const row = { ...value, id: String(expenses.size + 1) };
        expenses.set(value.sourceKey, row);
        return row;
      },
      async findBySourceKey(key) {
        return expenses.get(key) ?? null;
      },
      async findBySourcePrefix(prefix) {
        return [...expenses]
          .filter(([key]) => key.startsWith(prefix))
          .map(([, row]) => row);
      },
    },
    catalogRepository: {
      async findActiveByCode(_kind, code) {
        return marker.get(code) ?? null;
      },
      async insert(value) {
        marker.set(value.code, value);
        return value;
      },
    },
    personRepository: {
      async findActiveEmployees() {
        return employees;
      },
    },
    groupRepository: {
      async findActiveForSnapshot() {
        return [{ id: "group", educatorId: "edu", assistantId: "asst" }];
      },
    },
    childRepository: {
      async countOccupiedByGroups() {
        return new Map([["group", 20]]);
      },
    },
    authorizer,
    unitOfWork: {
      async execute(fn) {
        return fn({ session: null, recordAudit: async () => {} });
      },
    },
    clock: { now: () => new Date("2026-03-02T08:15:00.000Z") },
  };
  const service = new OpenMonthService(dependencies);
  const admin = { id: "admin", roles: ["ADMIN"] };
  const first = await service.openCurrentMonth(admin, "request");
  assert.equal(first.month, "2026-03");
  assert.equal(
    first.expenses.find((x) => x.category === "RENT").amountCents,
    5_000_000,
  );
  assert.equal(expenses.get("MONTH:2026-03:SALARY:edu").amountCents, 8_000_000);
  assert.equal(
    expenses.get("MONTH:2026-03:SALARY:asst").amountCents,
    4_400_000,
  );
  assert.equal(
    expenses.get("MONTH:2026-03:SALARY:teacher").amountCents,
    2_400_000,
  );
  assert.equal(
    expenses.get("MONTH:2026-03:SALARY:edu").snapshot.occupiedSeats,
    20,
  );
  employees.splice(0);
  const second = await service.openCurrentMonth(admin, "request-2");
  assert.deepEqual(
    second.expenses.map(({ sourceKey }) => sourceKey),
    first.expenses.map(({ sourceKey }) => sourceKey),
  );
  assert.equal(expenses.size, 4);
});
