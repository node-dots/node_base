import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import mongoose from "mongoose";
import { InvoiceModel } from "../../src/modules/invoices/invoice.model.js";
import { InvoiceRepository } from "../../src/modules/invoices/invoice.repository.js";
import { ChildModel } from "../../src/modules/children/child.model.js";
import { PaymentModel } from "../../src/modules/payments/payment.model.js";

test(
  "MongoDB: invoice balances sum parts once, honor guardian scope, overdue clock and refund due",
  { skip: process.env.RUN_MONGO_TESTS !== "true" },
  async () => {
    const connection = await mongoose
      .createConnection(
        "mongodb://127.0.0.1:27017/?replicaSet=rs0&directConnection=true",
        {
          dbName: `invoice_balances_${randomUUID().replaceAll("-", "")}`,
          serverSelectionTimeoutMS: 5000,
        },
      )
      .asPromise();
    try {
      const invoices = connection.model("Invoice", InvoiceModel.schema);
      const children = connection.model("Child", ChildModel.schema);
      const payments = connection.model("Payment", PaymentModel.schema);
      await Promise.all([invoices.init(), children.init(), payments.init()]);
      const guardianId = new mongoose.Types.ObjectId();
      const foreignGuardianId = new mongoose.Types.ObjectId();
      const childId = new mongoose.Types.ObjectId();
      const foreignChildId = new mongoose.Types.ObjectId();
      await children.create([
        {
          _id: childId,
          firstName: "Own",
          lastName: "Child",
          dateOfBirth: "2022-01-01",
          status: "LEFT",
          guardians: [{ personId: guardianId, relationship: "parent" }],
        },
        {
          _id: foreignChildId,
          firstName: "Other",
          lastName: "Child",
          dateOfBirth: "2022-01-01",
          status: "LEFT",
          guardians: [{ personId: foreignGuardianId, relationship: "parent" }],
        },
      ]);
      const invoiceBase = (id, child, parts, values = {}) => ({
        _id: id,
        childId: child,
        service: "TUITION",
        serviceMonth: "2027-01",
        status: "PARTIAL",
        origAmountCents: parts.reduce((sum, part) => sum + part.amountCents, 0),
        remainingAmountCents: parts.reduce(
          (sum, part) => sum + part.remainingCents,
          0,
        ),
        paidAmountCents: 1000,
        refundableAmountCents: 800,
        tariffSnapshot: {
          code: "TUITION",
          effectiveFrom: "2026-09-01",
          amountCents: 1000,
        },
        benefitSnapshot: { code: "NONE", basisPoints: 0 },
        formula: "test",
        dueAt: new Date("2027-01-10T00:00:00.000Z"),
        parts,
        ...values,
      });
      const ownInvoiceId = new mongoose.Types.ObjectId();
      const foreignInvoiceId = new mongoose.Types.ObjectId();
      await invoices.create([
        invoiceBase(
          ownInvoiceId,
          childId,
          [
            {
              month: "2027-01",
              amountCents: 1000,
              remainingCents: 0,
              cancelled: false,
            },
            {
              month: "2027-02",
              amountCents: 2000,
              remainingCents: 500,
              cancelled: false,
            },
            {
              month: "2027-03",
              amountCents: 3000,
              remainingCents: 0,
              cancelled: true,
            },
            ...Array.from({ length: 9 }, (_, index) => ({
              month: `2027-${String(index + 4).padStart(2, "0")}`,
              amountCents: 0,
              remainingCents: 0,
              cancelled: false,
            })),
          ],
          { billingType: "ANNUAL" },
        ),
        invoiceBase(foreignInvoiceId, foreignChildId, [
          {
            month: "2027-01",
            amountCents: 9000,
            remainingCents: 9000,
            cancelled: false,
          },
        ]),
      ]);
      const actorId = new mongoose.Types.ObjectId();
      const hash = "a".repeat(64);
      await payments.create([
        {
          invoiceId: ownInvoiceId,
          amountCents: 500,
          method: "CASH",
          status: "CONFIRMED",
          payerPersonId: guardianId,
          actorId,
          idempotencyKey: "balance-receipt-1",
          payloadHash: hash,
          reportedAt: new Date(),
          occurredAt: new Date("2027-01-12T00:00:00.000Z"),
          confirmedAt: new Date(),
        },
        {
          invoiceId: ownInvoiceId,
          amountCents: 500,
          method: "CASH",
          status: "CONFIRMED",
          payerPersonId: guardianId,
          actorId,
          idempotencyKey: "balance-receipt-2",
          payloadHash: hash,
          reportedAt: new Date(),
          occurredAt: new Date("2027-01-12T00:00:00.000Z"),
          confirmedAt: new Date(),
        },
        {
          invoiceId: ownInvoiceId,
          amountCents: 9000,
          method: "CASH",
          status: "PENDING",
          payerPersonId: guardianId,
          actorId,
          idempotencyKey: "balance-pending",
          payloadHash: hash,
          reportedAt: new Date(),
        },
      ]);
      const repository = new InvoiceRepository({ invoiceModel: invoices });
      const totals = await repository.aggregateCurrentBalances({
        asOf: new Date("2027-02-15T00:00:00.000Z"),
        guardianId: guardianId.toString(),
      });
      assert.deepEqual(totals, {
        currentOutstandingCents: 500,
        currentOverdueCents: 500,
        currentRefundDueCents: 800,
      });
      const staffTotals = await repository.aggregateCurrentBalances({
        asOf: new Date("2027-01-05T00:00:00.000Z"),
      });
      assert.equal(staffTotals.currentOutstandingCents, 9500);
      assert.equal(staffTotals.currentOverdueCents, 0);
      const overdueTotals = await repository.aggregateCurrentBalances({
        asOf: new Date("2027-01-15T00:00:00.000Z"),
      });
      assert.equal(overdueTotals.currentOverdueCents, 9500);
    } finally {
      await connection.dropDatabase();
      await connection.close();
    }
  },
);
