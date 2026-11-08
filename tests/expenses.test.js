import test from "node:test";
import assert from "node:assert/strict";
import { ExpenseService } from "../src/modules/expenses/expense.service.js";
import { authorizer } from "../src/modules/people/access/authorizer.js";

const admin = { id: "507f1f77bcf86cd799439011", roles: ["ADMIN"] };
function setup() {
  const rows = new Map();
  let sequence = 1;
  const repository = {
    async insert(data) {
      const row = {
        ...data,
        id: String(sequence++),
        ...(data.status ? {} : { status: "DRAFT" }),
      };
      rows.set(row.id, row);
      return row;
    },
    async findById(id) {
      return rows.get(id) ?? null;
    },
    async approve(id) {
      const row = rows.get(id);
      if (!row || row.status !== "DRAFT") return null;
      row.status = "APPROVED";
      return row;
    },
    async pay(id, paymentDate, paidAt) {
      const row = rows.get(id);
      if (!row || row.status !== "APPROVED" || row.paidAt) return null;
      Object.assign(row, { paymentDate, paidAt });
      return row;
    },
    async cancel(id) {
      const row = rows.get(id);
      if (!row || row.status !== "DRAFT") return null;
      row.status = "CANCELLED";
      return row;
    },
    async netApproved(id) {
      const original = rows.get(id);
      return original?.amountCents ?? 0;
    },
    async sumApproved() {
      return 50000;
    },
    async sumCashFlow() {
      return 50000;
    },
  };
  const service = new ExpenseService({
    expenseRepository: repository,
    authorizer,
    unitOfWork: {
      execute: (fn) => fn({ session: null, recordAudit: async () => {} }),
    },
    clock: { now: () => new Date("2026-02-03T10:00:00Z") },
  });
  return { service, rows };
}

test("expense keeps service month separate from payment date and prevents repeated pay", async () => {
  const { service } = setup();
  const draft = await service.create(
    {
      category: "FOOD",
      amountCents: 12500,
      serviceMonth: "2026-01",
      reason: "January food delivery",
    },
    admin,
    "req",
  );
  assert.equal(draft.status, "DRAFT");
  await service.approve(draft.id, admin, "req");
  const paid = await service.pay(
    draft.id,
    { paymentDate: "2026-02-03" },
    admin,
    "req",
  );
  assert.equal(paid.serviceMonth, "2026-01");
  assert.equal(paid.paymentDate, "2026-02-03");
  await assert.rejects(
    service.pay(draft.id, { paymentDate: "2026-02-03" }, admin, "req"),
    { code: "EXPENSE_NOT_PAYABLE" },
  );
});

test("expense approval and payment require ADMIN policy; dates and corrections are validated", async () => {
  const { service } = setup();
  const manager = { id: admin.id, roles: ["MANAGER"] };
  await assert.rejects(
    service.create(
      {
        category: "RENT",
        amountCents: 1,
        serviceMonth: "2026-01",
        reason: "Rent",
      },
      manager,
      "req",
    ),
    { status: 403 },
  );
  await assert.rejects(
    service.pay("some-id", { paymentDate: "2026-02-31" }, admin, "req"),
    { code: "INVALID_PAYMENT_DATE" },
  );
  assert.deepEqual(await service.readTotals("2026-01", admin), {
    serviceMonth: "2026-01",
    approvedAmountCents: 50000,
    cashOutflowCents: 50000,
  });
});
