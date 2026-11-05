import test from "node:test";
import assert from "node:assert/strict";
import { authorizer } from "../src/modules/people/access/authorizer.js";
import { InvoiceService } from "../src/modules/invoices/invoice.service.js";
import {
  countWeekdaysInServiceMonth,
  calculateMealCents,
  calculateAnnualTuitionParts,
  calculateTuitionCents,
  addServiceMonths,
  annualPaymentDeadline,
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

test("annual tuition uses sequential discounts and allocates exact cents", () => {
  const parts = calculateAnnualTuitionParts(1_500_000, 1_000);
  assert.equal(parts.length, 12);
  assert.equal(
    parts.reduce((sum, part) => sum + part.amountCents, 0),
    14_256_000,
  );
  assert.deepEqual(
    parts.map((part) => part.amountCents),
    Array(12).fill(1_188_000),
  );
  assert.equal(addServiceMonths("2026-12", 2), "2027-02");
  assert.equal(
    annualPaymentDeadline("2026-12").toISOString(),
    "2026-11-30T21:59:59.999Z",
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

test("annual tuition snapshots first-month terms, reserves 12 months and allocates 14,256,000 cents", async () => {
  const state = { invoices: [], audits: [] };
  const childId = "000000000000000000000001";
  const service = new InvoiceService({
    invoiceRepository: {
      async findTuitionCoveringMonth(_childId, month) {
        return (
          state.invoices.find((invoice) =>
            invoice.parts.some((part) => part.month === month),
          ) ?? null
        );
      },
      async insert(invoice) {
        const saved = { ...structuredClone(invoice), id: "annual-1" };
        state.invoices.push(saved);
        return saved;
      },
    },
    childRepository: {
      async findById() {
        return {
          id: childId,
          status: "ACTIVE",
          billingStartMonth: "2026-10",
          benefitAssignments: [
            {
              benefitCode: "BENEFIT_10",
              basisPoints: 1_000,
              startMonth: "2026-12",
            },
          ],
        };
      },
    },
    catalogRepository: {
      async findLatestValid() {
        return {
          code: "TUITION_MONTHLY",
          effectiveFrom: "2026-01-01",
          amountCents: 1_500_000,
        };
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
  const invoice = await service.createAnnualTuition(
    childId,
    "2026-12",
    { id: "000000000000000000000003", roles: ["ADMIN"] },
    "req-annual",
  );
  assert.equal(invoice.billingType, "ANNUAL");
  assert.equal(invoice.origAmountCents, 14_256_000);
  assert.equal(invoice.parts.length, 12);
  assert.equal(invoice.parts[0].month, "2026-12");
  assert.equal(invoice.parts[11].month, "2027-11");
  assert.equal(invoice.benefitSnapshot.basisPoints, 1_000);
  assert.equal(state.audits.length, 1);
});

test("current balance report uses guardian scope and a supplied as-of clock without payment joins", async () => {
  const asOf = new Date("2027-02-01T00:00:00.000Z");
  const calls = [];
  const service = new InvoiceService({
    invoiceRepository: {
      async aggregateCurrentBalances(input) {
        calls.push(input);
        return {
          currentOutstandingCents: 500,
          currentOverdueCents: 500,
          currentRefundDueCents: 800,
        };
      },
    },
    childRepository: {},
    catalogRepository: {},
    authorizer,
    unitOfWork: {},
    clock: { now: () => asOf },
  });
  const parent = { id: "507f1f77bcf86cd799439011", roles: ["PARENT"] };
  assert.deepEqual(await service.getCurrentBalances(parent), {
    currentOutstandingCents: 500,
    currentOverdueCents: 500,
    currentRefundDueCents: 800,
    asOf,
    basis: "CURRENT_BALANCE_NOT_HISTORICAL",
  });
  assert.deepEqual(calls[0], { asOf, guardianId: parent.id });
  await service.getCurrentBalances({ id: "staff", roles: ["MANAGER"] });
  assert.deepEqual(calls[1], { asOf, guardianId: undefined });
  await assert.rejects(
    service.getCurrentBalances({ id: "teacher", roles: ["TEACHER"] }),
    { status: 403 },
  );
});

test("expired unpaid annual fallback is atomic in one transaction and repeat-safe", async () => {
  const childId = "000000000000000000000001";
  const annual = {
    id: "annual-1",
    billingType: "ANNUAL",
    serviceMonth: "2026-10",
    status: "OPEN",
    origAmountCents: 14_256_000,
  };
  const state = { annual, monthly: null, audits: [] };
  const service = new InvoiceService({
    invoiceRepository: {
      async findByUnique() {
        return state.monthly;
      },
      async cancelExpiredAnnual() {
        if (state.annual.status !== "OPEN") return null;
        state.annual = { ...state.annual, status: "CANCELLED" };
        return state.annual;
      },
      async insert(draft) {
        state.monthly = { ...structuredClone(draft), id: "monthly-1" };
        return state.monthly;
      },
    },
    childRepository: {
      async findById() {
        return {
          id: childId,
          status: "ACTIVE",
          billingStartMonth: "2026-10",
          benefitAssignments: [],
        };
      },
    },
    catalogRepository: {
      async findLatestValid() {
        return {
          code: "TUITION_MONTHLY",
          effectiveFrom: "2026-01-01",
          amountCents: 1_500_000,
        };
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
  const actor = { id: "000000000000000000000003", roles: ["ADMIN"] };
  const first = await service.fallbackExpiredAnnual(childId, actor, "req-1");
  const repeated = await service.fallbackExpiredAnnual(childId, actor, "req-2");
  assert.equal(first.annual.status, "CANCELLED");
  assert.equal(first.annual.origAmountCents, 14_256_000);
  assert.equal(first.monthly.serviceMonth, "2026-11");
  assert.equal(first.monthly.origAmountCents, 1_500_000);
  assert.equal(repeated.monthly.id, first.monthly.id);
  assert.equal(repeated.skipped, "ALREADY_FALLBACK");
  assert.equal(state.audits.length, 1);
});
