import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import mongoose from "mongoose";
import { createFixedClock } from "../../src/utils/calendar.js";
import { InvoiceModel } from "../../src/modules/invoices/invoice.model.js";
import { InvoiceRepository } from "../../src/modules/invoices/invoice.repository.js";
import { PaymentModel } from "../../src/modules/payments/payment.model.js";
import { PaymentRepository } from "../../src/modules/payments/payment.repository.js";
import { PaymentService } from "../../src/modules/payments/payment.service.js";
import { UnitOfWork } from "../../src/workflows/unitOfWork.js";
import { authorizer } from "../../src/modules/people/access/authorizer.js";

test(
  "MongoDB: concurrent payment report idempotency creates one PENDING row without changing invoice totals",
  { skip: process.env.RUN_MONGO_TESTS !== "true" },
  async () => {
    const databaseName = `kindergarten_payments_${randomUUID().replaceAll("-", "")}`;
    const connection = await mongoose
      .createConnection(
        "mongodb://127.0.0.1:27017/?replicaSet=rs0&directConnection=true",
        { dbName: databaseName, serverSelectionTimeoutMS: 5000 },
      )
      .asPromise();
    try {
      const invoiceModel = connection.model("Invoice", InvoiceModel.schema);
      const paymentModel = connection.model("Payment", PaymentModel.schema);
      await Promise.all([invoiceModel.init(), paymentModel.init()]);
      const childId = new mongoose.Types.ObjectId("000000000000000000000020");
      const payerId = new mongoose.Types.ObjectId("000000000000000000000030");
      const [invoice] = await invoiceModel.create([
        {
          childId,
          service: "TUITION",
          serviceMonth: "2026-11",
          status: "OPEN",
          origAmountCents: 50_000,
          remainingAmountCents: 50_000,
          tariffSnapshot: {
            code: "TUITION_MONTHLY",
            effectiveFrom: "2026-01-01",
            amountCents: 50_000,
          },
          formula: "50000",
          dueAt: new Date("2026-11-10T21:59:59.999Z"),
          parts: [
            { month: "2026-11", amountCents: 50_000, remainingCents: 50_000 },
          ],
        },
      ]);
      const auditCollection = connection.collection("payment_test_audit");
      const service = new PaymentService({
        paymentRepository: new PaymentRepository({ paymentModel }),
        invoiceRepository: new InvoiceRepository({ invoiceModel }),
        childRepository: {
          async findById() {
            return {
              id: childId.toString(),
              guardians: [{ personId: payerId.toString() }],
            };
          },
        },
        authorizer,
        unitOfWork: new UnitOfWork({
          connection,
          auditWriter: {
            async record(event, { session }) {
              await auditCollection.insertOne(event, { session });
            },
          },
        }),
        clock: createFixedClock("2026-11-05T12:00:00.000Z"),
      });
      const input = {
        invoiceId: invoice._id.toString(),
        amountCents: 20_000,
        method: "BANK_TRANSFER",
        idempotencyKey: "integration-payment-001",
      };
      const actor = { id: payerId.toString(), roles: ["PARENT"] };
      const results = await Promise.all([
        service.reportPending(input, actor, "request-a"),
        service.reportPending(input, actor, "request-b"),
      ]);
      assert.equal(await paymentModel.countDocuments(), 1);
      assert.deepEqual(results[0], results[1]);
      assert.equal(
        (await invoiceModel.findById(invoice._id).lean()).paidAmountCents,
        0,
      );
      assert.equal(
        (await invoiceModel.findById(invoice._id).lean()).remainingAmountCents,
        50_000,
      );
    } finally {
      await connection.dropDatabase();
      await connection.close();
    }
  },
);

test(
  "MongoDB: concurrent confirmations cannot overpay an invoice",
  { skip: process.env.RUN_MONGO_TESTS !== "true" },
  async () => {
    const databaseName = `kindergarten_payment_confirm_${randomUUID().replaceAll("-", "")}`;
    const connection = await mongoose
      .createConnection(
        "mongodb://127.0.0.1:27017/?replicaSet=rs0&directConnection=true",
        { dbName: databaseName, serverSelectionTimeoutMS: 5000 },
      )
      .asPromise();
    try {
      const invoiceModel = connection.model("Invoice", InvoiceModel.schema);
      const paymentModel = connection.model("Payment", PaymentModel.schema);
      await Promise.all([invoiceModel.init(), paymentModel.init()]);
      const childId = new mongoose.Types.ObjectId("000000000000000000000020");
      const payerId = new mongoose.Types.ObjectId("000000000000000000000030");
      const managerId = new mongoose.Types.ObjectId("000000000000000000000040");
      const [invoice] = await invoiceModel.create([
        {
          childId,
          service: "TUITION",
          serviceMonth: "2026-11",
          status: "OPEN",
          origAmountCents: 50_000,
          remainingAmountCents: 50_000,
          tariffSnapshot: {
            code: "TUITION_MONTHLY",
            effectiveFrom: "2026-01-01",
            amountCents: 50_000,
          },
          formula: "50000",
          dueAt: new Date("2026-11-10T21:59:59.999Z"),
          parts: [
            { month: "2026-11", amountCents: 50_000, remainingCents: 50_000 },
          ],
        },
      ]);
      const auditCollection = connection.collection("payment_confirm_audit");
      const service = new PaymentService({
        paymentRepository: new PaymentRepository({ paymentModel }),
        invoiceRepository: new InvoiceRepository({ invoiceModel }),
        childRepository: {
          async findById() {
            return {
              id: childId.toString(),
              guardians: [{ personId: payerId.toString() }],
            };
          },
        },
        authorizer,
        unitOfWork: new UnitOfWork({
          connection,
          auditWriter: {
            async record(event, { session }) {
              await auditCollection.insertOne(event, { session });
            },
          },
        }),
        clock: createFixedClock("2026-11-05T12:00:00.000Z"),
      });
      const parent = { id: payerId.toString(), roles: ["PARENT"] };
      const manager = { id: managerId.toString(), roles: ["MANAGER"] };
      const paymentInputs = ["payment-overpay-a", "payment-overpay-b"].map(
        (idempotencyKey) => ({
          invoiceId: invoice._id.toString(),
          amountCents: 50_000,
          method: "BANK_TRANSFER",
          idempotencyKey,
        }),
      );
      const payments = await Promise.all(
        paymentInputs.map((input) =>
          service.reportPending(
            input,
            parent,
            `report-${input.idempotencyKey}`,
          ),
        ),
      );
      const outcomes = await Promise.allSettled(
        payments.map((payment) =>
          service.confirm(
            payment.id,
            { occurredAt: "2026-11-05T11:00:00.000Z" },
            manager,
            `confirm-${payment.id}`,
          ),
        ),
      );
      assert.equal(
        outcomes.filter(({ status }) => status === "fulfilled").length,
        1,
      );
      assert.equal(
        outcomes.filter(
          ({ status, reason }) =>
            status === "rejected" && reason.code === "PAYMENT_EXCEEDS_BALANCE",
        ).length,
        1,
      );
      const savedInvoice = await invoiceModel.findById(invoice._id).lean();
      assert.equal(savedInvoice.paidAmountCents, 50_000);
      assert.equal(savedInvoice.remainingAmountCents, 0);
      assert.equal(savedInvoice.status, "PAID");
      assert.equal(
        await paymentModel.countDocuments({ status: "CONFIRMED" }),
        1,
      );
      assert.equal(
        await auditCollection.countDocuments({ action: "payment.confirm" }),
        1,
      );
    } finally {
      await connection.dropDatabase();
      await connection.close();
    }
  },
);
