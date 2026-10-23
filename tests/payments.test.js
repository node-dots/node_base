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
  };
  const service = new PaymentService({
    paymentRepository,
    invoiceRepository: {
      async findById() {
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
