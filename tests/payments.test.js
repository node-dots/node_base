import test from "node:test";
import assert from "node:assert/strict";
import { authorizer } from "../src/modules/people/access/authorizer.js";
import { PaymentService } from "../src/modules/payments/payment.service.js";
import { createPendingPaymentSchema } from "../src/modules/payments/payment.schema.js";

function buildFixture() {
  const invoice = {
    id: "000000000000000000000010",
    childId: "000000000000000000000020",
    status: "OPEN",
    remainingAmountCents: 50_000,
    paidAmountCents: 0,
  };
  const child = {
    id: invoice.childId,
    guardians: [{ personId: "000000000000000000000030" }],
  };
  const records = [];
  const audits = [];
  const paymentRepository = {
    async findById(paymentId) {
      const item = records.find(({ id }) => id === paymentId);
      return item ? structuredClone(item) : null;
    },
    async findByIdempotency({ actorId, idempotencyKey }) {
      return (
        records.find(
          (item) =>
            item.actorId === actorId && item.idempotencyKey === idempotencyKey,
        ) ?? null
      );
    },
    async insert(payment) {
      const record = {
        ...structuredClone(payment),
        id: `payment-${records.length + 1}`,
      };
      records.push(record);
      return record;
    },
    async confirmPending(paymentId, updates) {
      const record = records.find(({ id }) => id === paymentId);
      if (!record || record.status !== "PENDING") return null;
      Object.assign(record, updates, { status: "CONFIRMED" });
      return structuredClone(record);
    },
    async rejectPending(paymentId, updates) {
      const record = records.find(({ id }) => id === paymentId);
      if (!record || record.status !== "PENDING") return null;
      Object.assign(record, updates, { status: "REJECTED" });
      return structuredClone(record);
    },
  };
  const service = new PaymentService({
    paymentRepository,
    invoiceRepository: {
      async findById() {
        return invoice;
      },
      async applyReceipt(_invoiceId, amountCents) {
        if (invoice.remainingAmountCents < amountCents) return null;
        invoice.paidAmountCents += amountCents;
        invoice.remainingAmountCents -= amountCents;
        invoice.status = invoice.remainingAmountCents ? "PARTIAL" : "PAID";
        return invoice;
      },
    },
    childRepository: {
      async findById() {
        return child;
      },
    },
    authorizer,
    unitOfWork: {
      async execute(operation) {
        return operation({
          session: {},
          async recordAudit(event) {
            audits.push(event);
          },
        });
      },
    },
    clock: { now: () => new Date("2026-11-05T12:00:00.000Z") },
  });
  return { service, invoice, child, records, audits };
}

test("payment report stays PENDING, derives parent payer and is idempotent", async () => {
  const { service, invoice, records, audits } = buildFixture();
  const parent = { id: "000000000000000000000030", roles: ["PARENT"] };
  const input = {
    invoiceId: invoice.id,
    amountCents: 20_000,
    method: "BANK_TRANSFER",
    idempotencyKey: "report-2026-0001",
  };
  const first = await service.reportPending(input, parent, "req-1");
  const repeat = await service.reportPending(input, parent, "req-2");
  assert.equal(first.status, "PENDING");
  assert.deepEqual(repeat, first);
  assert.equal(records.length, 1);
  assert.equal(records[0].payerPersonId, parent.id);
  assert.equal(records[0].actorId, parent.id);
  assert.equal(invoice.paidAmountCents, 0);
  assert.equal(invoice.remainingAmountCents, 50_000);
  assert.equal(audits.length, 1);
  assert.deepEqual(Object.keys(first).sort(), [
    "amountCents",
    "id",
    "invoiceId",
    "method",
    "reportedAt",
    "status",
  ]);
});

test("same idempotency key with changed data conflicts; parent cannot impersonate another payer", async () => {
  const { service, invoice, records } = buildFixture();
  const parent = { id: "000000000000000000000030", roles: ["PARENT"] };
  const input = {
    invoiceId: invoice.id,
    amountCents: 20_000,
    method: "CASH",
    idempotencyKey: "report-2026-0002",
  };
  await service.reportPending(input, parent, "req-1");
  await assert.rejects(
    service.reportPending({ ...input, amountCents: 21_000 }, parent, "req-2"),
    { code: "IDEMPOTENCY_KEY_CONFLICT" },
  );
  await assert.rejects(
    service.reportPending(
      {
        ...input,
        idempotencyKey: "report-2026-0003",
        payerPersonId: "000000000000000000000099",
      },
      parent,
      "req-3",
    ),
    { code: "PAYER_FORBIDDEN" },
  );
  assert.equal(records.length, 1);
});

test("foreign invoice is hidden and a staff actor must name a verified guardian payer", async () => {
  const { service, invoice, child, records } = buildFixture();
  const body = {
    invoiceId: invoice.id,
    amountCents: 10_000,
    method: "CASH",
    idempotencyKey: "report-staff-0001",
  };
  await assert.rejects(
    service.reportPending(
      body,
      { id: "000000000000000000000099", roles: ["PARENT"] },
      "req",
    ),
    { code: "INVOICE_NOT_FOUND" },
  );
  const manager = { id: "000000000000000000000040", roles: ["MANAGER"] };
  await assert.rejects(
    service.reportPending(
      {
        ...body,
        idempotencyKey: "report-staff-0002",
        payerPersonId: "000000000000000000000099",
      },
      manager,
      "req",
    ),
    { code: "PAYER_NOT_GUARDIAN" },
  );
  const accepted = await service.reportPending(
    { ...body, payerPersonId: child.guardians[0].personId },
    manager,
    "req",
  );
  assert.equal(accepted.status, "PENDING");
  assert.equal(records[0].payerPersonId, child.guardians[0].personId);
  assert.equal(records[0].actorId, manager.id);
});

test("pending payment schema rejects card data and invalid methods or amounts", () => {
  const valid = {
    invoiceId: "000000000000000000000010",
    amountCents: 100,
    method: "CASH",
    idempotencyKey: "valid-key-0001",
  };
  assert.equal(createPendingPaymentSchema.safeParse(valid).success, true);
  assert.equal(
    createPendingPaymentSchema.safeParse({
      ...valid,
      cardNumber: "4111111111111111",
    }).success,
    false,
  );
  assert.equal(
    createPendingPaymentSchema.safeParse({ ...valid, amountCents: 0 }).success,
    false,
  );
  assert.equal(
    createPendingPaymentSchema.safeParse({ ...valid, method: "CARD" }).success,
    false,
  );
});

test("manager confirmation atomically changes payment, invoice and audit and is repeatable", async () => {
  const { service, invoice, records, audits } = buildFixture();
  const parent = { id: "000000000000000000000030", roles: ["PARENT"] };
  const manager = { id: "000000000000000000000040", roles: ["MANAGER"] };
  const payment = await service.reportPending(
    {
      invoiceId: invoice.id,
      amountCents: 50_000,
      method: "CASH",
      idempotencyKey: "confirm-test-0001",
    },
    parent,
    "req-report",
  );
  await assert.rejects(
    service.confirm(
      payment.id,
      { occurredAt: "2026-11-05T12:00:00Z" },
      parent,
      "req-parent-confirm",
    ),
    { code: "FORBIDDEN" },
  );
  const input = { occurredAt: "2026-11-04T12:00:00Z" };
  const confirmed = await service.confirm(payment.id, input, manager, "req-c1");
  const repeated = await service.confirm(
    payment.id,
    { occurredAt: "2026-11-05T11:00:00Z" },
    manager,
    "req-c2",
  );
  assert.deepEqual(repeated, confirmed);
  assert.equal(confirmed.status, "CONFIRMED");
  assert.equal(
    records[0].occurredAt.toISOString(),
    new Date(input.occurredAt).toISOString(),
  );
  assert.equal(
    records[0].confirmedAt.toISOString(),
    "2026-11-05T12:00:00.000Z",
  );
  assert.equal(invoice.paidAmountCents, 50_000);
  assert.equal(invoice.remainingAmountCents, 0);
  assert.equal(invoice.status, "PAID");
  assert.equal(
    audits.filter(({ action }) => action === "payment.confirm").length,
    1,
  );
});

test("rejected payment is repeatable and never changes invoice totals", async () => {
  const { service, invoice, records, audits } = buildFixture();
  const parent = { id: "000000000000000000000030", roles: ["PARENT"] };
  const manager = { id: "000000000000000000000040", roles: ["MANAGER"] };
  const payment = await service.reportPending(
    {
      invoiceId: invoice.id,
      amountCents: 10_000,
      method: "CASH",
      idempotencyKey: "reject-test-0001",
    },
    parent,
    "req-report",
  );
  const first = await service.reject(payment.id, manager, "req-r1");
  const repeated = await service.reject(payment.id, manager, "req-r2");
  assert.deepEqual(repeated, first);
  assert.equal(records[0].status, "REJECTED");
  assert.equal(invoice.paidAmountCents, 0);
  assert.equal(invoice.remainingAmountCents, 50_000);
  assert.equal(
    audits.filter(({ action }) => action === "payment.reject").length,
    1,
  );
});

test("confirmation rejects future occurrence times", async () => {
  const { service } = buildFixture();
  await assert.rejects(
    service.confirm(
      "000000000000000000000001",
      { occurredAt: "2026-11-06T00:00:00Z" },
      { id: "000000000000000000000040", roles: ["MANAGER"] },
      "req-future",
    ),
    { code: "PAYMENT_OCCURRED_IN_FUTURE" },
  );
});

test("annual tuition rejects partial reports and late confirmation", async () => {
  const { service, invoice, records } = buildFixture();
  invoice.billingType = "ANNUAL";
  invoice.serviceMonth = "2026-12";
  invoice.origAmountCents = 50_000;
  const parent = { id: "000000000000000000000030", roles: ["PARENT"] };
  const manager = { id: "000000000000000000000040", roles: ["MANAGER"] };
  await assert.rejects(
    service.reportPending(
      {
        invoiceId: invoice.id,
        amountCents: 10_000,
        method: "CASH",
        idempotencyKey: "annual-partial-001",
      },
      parent,
      "req-partial",
    ),
    { code: "ANNUAL_PAYMENT_MUST_BE_FULL" },
  );
  const payment = await service.reportPending(
    {
      invoiceId: invoice.id,
      amountCents: 50_000,
      method: "CASH",
      idempotencyKey: "annual-full-0001",
    },
    parent,
    "req-full",
  );
  service.clock = { now: () => new Date("2026-12-01T00:00:00.000Z") };
  await assert.rejects(
    service.confirm(
      payment.id,
      { occurredAt: "2026-11-30T20:00:00.000Z" },
      manager,
      "req-late",
    ),
    { code: "ANNUAL_PAYMENT_DEADLINE_PASSED" },
  );
  assert.equal(records[0].status, "PENDING");
  assert.equal(invoice.remainingAmountCents, 50_000);
});

test("annual tuition confirms only the complete payment before the Kyiv deadline", async () => {
  const { service, invoice, records, audits } = buildFixture();
  invoice.billingType = "ANNUAL";
  invoice.serviceMonth = "2026-12";
  invoice.origAmountCents = invoice.remainingAmountCents;
  const parent = { id: "000000000000000000000030", roles: ["PARENT"] };
  const manager = { id: "000000000000000000000040", roles: ["MANAGER"] };
  const payment = await service.reportPending(
    {
      invoiceId: invoice.id,
      amountCents: invoice.remainingAmountCents,
      method: "BANK_TRANSFER",
      idempotencyKey: "annual-confirm-0001",
    },
    parent,
    "req-report",
  );
  service.clock = { now: () => new Date("2026-11-30T21:00:00.000Z") };
  const confirmed = await service.confirm(
    payment.id,
    { occurredAt: "2026-11-30T20:00:00.000Z" },
    manager,
    "req-confirm",
  );
  assert.equal(confirmed.status, "CONFIRMED");
  assert.equal(invoice.status, "PAID");
  assert.equal(invoice.remainingAmountCents, 0);
  assert.equal(
    records[0].confirmedAt.toISOString(),
    "2026-11-30T21:00:00.000Z",
  );
  assert.equal(
    audits.filter(({ action }) => action === "payment.confirm").length,
    1,
  );
});

test("audit failure rolls confirmation and invoice balance back together", async () => {
  const { service, invoice, records, audits } = buildFixture();
  const parent = { id: "000000000000000000000030", roles: ["PARENT"] };
  const manager = { id: "000000000000000000000040", roles: ["MANAGER"] };
  const payment = await service.reportPending(
    {
      invoiceId: invoice.id,
      amountCents: 15_000,
      method: "CASH",
      idempotencyKey: "audit-failure-0001",
    },
    parent,
    "req-report",
  );
  service.unitOfWork = {
    async execute(operation) {
      const invoiceBefore = structuredClone(invoice);
      const paymentBefore = structuredClone(records[0]);
      const auditCount = audits.length;
      try {
        return await operation({
          session: {},
          recordAudit: async () => {
            throw new Error("audit storage unavailable");
          },
        });
      } catch (error) {
        Object.assign(invoice, invoiceBefore);
        Object.assign(records[0], paymentBefore);
        audits.length = auditCount;
        throw error;
      }
    },
  };
  await assert.rejects(
    service.confirm(
      payment.id,
      { occurredAt: "2026-11-05T11:00:00Z" },
      manager,
      "req-confirm",
    ),
    /audit storage unavailable/,
  );
  assert.equal(records[0].status, "PENDING");
  assert.equal(invoice.paidAmountCents, 0);
  assert.equal(invoice.remainingAmountCents, 50_000);
  assert.equal(audits.length, 1);
});
