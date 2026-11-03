import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import mongoose from "mongoose";
import { InvoiceModel } from "../../src/modules/invoices/invoice.model.js";
import { InvoiceRepository } from "../../src/modules/invoices/invoice.repository.js";

test(
  "MongoDB: annual reservations block monthly tuition and expired cancellation releases months without rewriting origin",
  { skip: process.env.RUN_MONGO_TESTS !== "true" },
  async () => {
    const databaseName = `kindergarten_annual_invoice_${randomUUID().replaceAll("-", "")}`;
    const connection = await mongoose
      .createConnection(
        "mongodb://127.0.0.1:27017/?replicaSet=rs0&directConnection=true",
        { dbName: databaseName, serverSelectionTimeoutMS: 5000 },
      )
      .asPromise();
    try {
      const model = connection.model("Invoice", InvoiceModel.schema);
      await model.init();
      const repository = new InvoiceRepository({ invoiceModel: model });
      const childId = "000000000000000000000001";
      const annualAmount = 14_256_000;
      const parts = Array.from({ length: 12 }, (_, index) => {
        const date = new Date(Date.UTC(2026, 9 + index, 1));
        const month = date.toISOString().slice(0, 7);
        return { month, amountCents: 1_188_000, remainingCents: 1_188_000 };
      });
      const annual = await repository.insert({
        childId,
        service: "TUITION",
        billingType: "ANNUAL",
        serviceMonth: "2026-10",
        status: "OPEN",
        origAmountCents: annualAmount,
        remainingAmountCents: annualAmount,
        tariffSnapshot: {
          code: "TUITION_MONTHLY",
          effectiveFrom: "2026-01-01",
          amountCents: 1_500_000,
        },
        formula: "annual tuition",
        dueAt: new Date("2026-09-30T20:59:59.999Z"),
        parts,
      });
      const monthlyDraft = {
        childId,
        service: "TUITION",
        billingType: "MONTHLY",
        serviceMonth: "2026-11",
        status: "OPEN",
        origAmountCents: 1_500_000,
        remainingAmountCents: 1_500_000,
        tariffSnapshot: {
          code: "TUITION_MONTHLY",
          effectiveFrom: "2026-01-01",
          amountCents: 1_500_000,
        },
        formula: "1500000",
        dueAt: new Date("2026-11-10T21:59:59.999Z"),
        parts: [
          {
            month: "2026-11",
            amountCents: 1_500_000,
            remainingCents: 1_500_000,
          },
        ],
      };
      await assert.rejects(
        repository.insert(monthlyDraft),
        (error) => error?.code === 11000,
      );

      const cancelled = await repository.cancelExpiredAnnual(
        childId,
        "2026-11",
      );
      assert.equal(cancelled.id, annual.id);
      assert.equal(cancelled.status, "CANCELLED");
      assert.equal(cancelled.origAmountCents, annualAmount);
      assert.equal(cancelled.remainingAmountCents, 0);
      assert.equal(cancelled.parts[1].remainingCents, 0);
      const monthly = await repository.insert(monthlyDraft);
      assert.equal(monthly.billingType, "MONTHLY");
      assert.equal(monthly.serviceMonth, "2026-11");
    } finally {
      try {
        await connection.dropDatabase();
      } finally {
        await connection.close();
      }
    }
  },
);
