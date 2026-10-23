import test from "node:test";
import assert from "node:assert/strict";
import { authorizer } from "../src/modules/people/access/authorizer.js";
import { InvoiceService } from "../src/modules/invoices/invoice.service.js";
import {
  countWeekdaysInServiceMonth,
  calculateMealCents,
  calculateTuitionCents,
  invoiceDueAt,
} from "../src/modules/invoices/invoice.calculations.js";

test("monthly invoice calculations use exact cents and Kyiv due-day boundary", () => {
  assert.equal(calculateTuitionCents(1_500_000, 1_000), 1_350_000);
  assert.equal(countWeekdaysInServiceMonth("2026-11"), 21);
  assert.equal(calculateMealCents(30_000, "2026-11"), 630_000);
  assert.equal(
    invoiceDueAt("2026-11").toISOString(),
    "2026-11-10T21:59:59.999Z",
  );
});

test("explicit invoice generation is repeat-safe, snapshots rates and flags missing prior month", async () => {
  const state = { invoices: [], audits: [] };
  const child = {
    id: "000000000000000000000001",
    status: "ACTIVE",
    billingStartMonth: "2026-10",
    ageCategoryId: "000000000000000000000002",
    benefitAssignments: [
      { benefitCode: "BENEFIT_10", basisPoints: 1_000, startMonth: "2026-11" },
    ],
  };
  const service = new InvoiceService({
    invoiceRepository: {
      async findByUnique(key) {
        return (
          state.invoices.find(
            (invoice) =>
              invoice.childId === key.childId &&
              invoice.service === key.service &&
              invoice.serviceMonth === key.serviceMonth,
          ) ?? null
        );
      },
      async insert(invoice) {
        const created = {
          ...structuredClone(invoice),
          id: `invoice-${state.invoices.length + 1}`,
        };
        state.invoices.push(created);
        return created;
      },
      async listByChild() {
        return state.invoices;
      },
    },
    childRepository: {
      async findById() {
        return child;
      },
    },
    catalogRepository: {
      async findLatestValid(kind, code) {
        return kind === "TUITION_RATE"
          ? { kind, code, effectiveFrom: "2026-01-01", amountCents: 1_500_000 }
          : { kind, code, effectiveFrom: "2026-01-01", amountCents: 30_000 };
      },
      async findById() {
        return { kind: "AGE_CATEGORY", code: "AGE_2", age: 2, active: true };
      },
    },
    authorizer,
    unitOfWork: {
      async execute(operation) {
        return operation({
          session: {},
          async recordAudit(event) {
            state.audits.push(event);
          },
        });
      },
    },
    clock: { now: () => new Date("2026-11-04T12:00:00.000Z") },
  });
  const admin = { id: "000000000000000000000003", roles: ["ADMIN"] };
  const first = await service.generateForCurrentMonth(child.id, admin, "req-1");
  const repeat = await service.generateForCurrentMonth(
    child.id,
    admin,
    "req-2",
  );
  assert.equal(first.invoices.length, 2);
  assert.equal(
    first.invoices.find((invoice) => invoice.service === "TUITION")
      .origAmountCents,
    1_350_000,
  );
  assert.equal(
    first.invoices.find((invoice) => invoice.service === "TUITION")
      .benefitSnapshot.basisPoints,
    1_000,
  );
  assert.equal(
    first.invoices.find((invoice) => invoice.service === "MEAL")
      .origAmountCents,
    630_000,
  );
  assert.equal(first.historyGap, true);
  assert.equal(repeat.invoices.length, 2);
  assert.equal(state.audits.length, 2);
});

test("applicants are skipped and guardians can read only their own children's invoices", async () => {
  let called = false;
  const child = {
    id: "000000000000000000000001",
    status: "APPLICANT",
    guardians: [{ personId: "000000000000000000000002" }],
  };
  const service = new InvoiceService({
    invoiceRepository: {
      async listByChild() {
        called = true;
        return [];
      },
    },
    childRepository: {
      async findById() {
        return child;
      },
    },
    catalogRepository: {},
    authorizer,
    unitOfWork: {},
    clock: { now: () => new Date("2026-11-04T12:00:00Z") },
  });
  assert.equal(
    (
      await service.generateForCurrentMonth(
        child.id,
        { id: "000000000000000000000003", roles: ["ADMIN"] },
        "req",
      )
    ).skipped,
    "CHILD_NOT_BILLABLE",
  );
  await assert.rejects(
    service.listForChild(child.id, {
      id: "000000000000000000000003",
      roles: ["PARENT"],
    }),
    { code: "CHILD_NOT_FOUND" },
  );
  assert.equal(called, false);
  const ownInvoices = await service.listForChild(child.id, {
    id: "000000000000000000000002",
    roles: ["PARENT"],
  });
  assert.deepEqual(ownInvoices, []);
  assert.equal(called, true);
});
