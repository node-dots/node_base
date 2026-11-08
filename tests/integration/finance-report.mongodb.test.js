import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import mongoose from "mongoose";
import { InvoiceModel } from "../../src/modules/invoices/invoice.model.js";
import { InvoiceRepository } from "../../src/modules/invoices/invoice.repository.js";
import { PaymentModel } from "../../src/modules/payments/payment.model.js";
import { RefundModel } from "../../src/modules/payments/refund.model.js";
import { ExpenseModel } from "../../src/modules/expenses/expense.model.js";
import { FinanceReportRepository } from "../../src/modules/reports/financeReport.repository.js";
import { FinanceReportService } from "../../src/modules/reports/financeReport.service.js";
import { authorizer } from "../../src/modules/people/access/authorizer.js";
import { createFixedClock } from "../../src/utils/calendar.js";

test(
  "MongoDB: finance report separates annual accrual, confirmed receipts, refund and paid expense dates",
  { skip: process.env.RUN_MONGO_TESTS !== "true" },
  async () => {
    const connection = await mongoose
      .createConnection(
        "mongodb://127.0.0.1:27017/?replicaSet=rs0&directConnection=true",
        {
          dbName: `finance_report_${randomUUID().replaceAll("-", "")}`,
          serverSelectionTimeoutMS: 5000,
        },
      )
      .asPromise();
    try {
      const invoices = connection.model("Invoice", InvoiceModel.schema);
      const payments = connection.model("Payment", PaymentModel.schema);
      const refunds = connection.model("Refund", RefundModel.schema);
      const expenses = connection.model("Expense", ExpenseModel.schema);
      await Promise.all([
        invoices.init(),
        payments.init(),
        refunds.init(),
        expenses.init(),
      ]);
      const guardianId = new mongoose.Types.ObjectId();
      const actorId = new mongoose.Types.ObjectId();
      const childId = new mongoose.Types.ObjectId();
      const annualId = new mongoose.Types.ObjectId();
      const mealId = new mongoose.Types.ObjectId();
      const annualParts = Array.from({ length: 12 }, (_, index) => ({
        month:
          index < 11 ? `2027-${String(index + 2).padStart(2, "0")}` : "2028-01",
        amountCents: 100,
        remainingCents: 0,
        cancelled: false,
      }));
      const invoice = (id, service, parts, values = {}) => ({
        _id: id,
        childId,
        service,
        serviceMonth: "2027-02",
        billingType: service === "TUITION" ? "ANNUAL" : "MONTHLY",
        status: values.status ?? "PAID",
        origAmountCents: parts.reduce((s, p) => s + p.amountCents, 0),
        remainingAmountCents: values.remainingAmountCents ?? 0,
        paidAmountCents:
          values.paidAmountCents ??
          parts.reduce((s, p) => s + p.amountCents, 0),
        refundableAmountCents: values.refundableAmountCents ?? 0,
        tariffSnapshot: {
          code: service,
          effectiveFrom: "2026-09-01",
          amountCents: 100,
        },
        benefitSnapshot: { code: "NONE", basisPoints: 0 },
        formula: "fixture",
        dueAt: new Date("2027-02-28T00:00:00.000Z"),
        parts,
        ...values,
      });
      await invoices.create([
        invoice(annualId, "TUITION", annualParts),
        invoice(
          mealId,
          "MEAL",
          [
            {
              month: "2027-02",
              amountCents: 1000,
              remainingCents: 400,
              cancelled: false,
            },
          ],
          { status: "PARTIAL", paidAmountCents: 600, refundableAmountCents: 0 },
        ),
      ]);
      const paymentIds = [
        new mongoose.Types.ObjectId(),
        new mongoose.Types.ObjectId(),
        new mongoose.Types.ObjectId(),
        new mongoose.Types.ObjectId(),
      ];
      const payment = (id, invoiceId, amountCents, status, key) => ({
        _id: id,
        invoiceId,
        amountCents,
        method: "CASH",
        status,
        payerPersonId: guardianId,
        actorId,
        idempotencyKey: key,
        payloadHash: "b".repeat(64),
        reportedAt: new Date("2027-02-05T12:00:00Z"),
        ...(status === "CONFIRMED"
          ? {
              occurredAt: new Date("2027-02-10T12:00:00Z"),
              confirmedAt: new Date("2027-02-10T12:00:00Z"),
            }
          : {}),
      });
      await payments.create([
        payment(paymentIds[0], annualId, 1200, "CONFIRMED", "annual-receipt"),
        payment(paymentIds[1], mealId, 300, "CONFIRMED", "meal-receipt-1"),
        payment(paymentIds[2], mealId, 300, "CONFIRMED", "meal-receipt-2"),
        payment(paymentIds[3], mealId, 5000, "PENDING", "pending-receipt"),
      ]);
      await refunds.create({
        paymentId: paymentIds[0],
        invoiceId: annualId,
        childId,
        actorId,
        amountCents: 200,
        reason: "Recorded refund",
        idempotencyKey: "annual-refund",
        payloadHash: "c".repeat(64),
        status: "CONFIRMED",
        recordedAt: new Date("2027-03-05T12:00:00Z"),
      });
      await expenses.create({
        category: "RENT",
        amountCents: 300,
        serviceMonth: "2027-02",
        reason: "February rent",
        status: "APPROVED",
        paymentDate: "2027-03-01",
        paidAt: new Date("2027-03-01T12:00:00Z"),
      });
      const service = new FinanceReportService({
        reportRepository: new FinanceReportRepository({
          invoiceModel: invoices,
          paymentModel: payments,
          refundModel: refunds,
          expenseModel: expenses,
        }),
        invoiceRepository: new InvoiceRepository({ invoiceModel: invoices }),
        authorizer,
        clock: createFixedClock("2027-03-15T12:00:00.000Z"),
      });
      const admin = { id: actorId.toString(), roles: ["ADMIN"] };
      const february = await service.monthly("2027-02", admin);
      assert.equal(february.accruedIncomeMinor, 1100);
      assert.equal(february.receiptsNetMinor, 1800);
      assert.equal(february.expensesMinor, 300);
      assert.equal(february.resultMinor, 800);
      assert.equal(february.cashFlowMinor, 1800);
      const march = await service.monthly("2027-03", admin);
      assert.equal(march.accruedIncomeMinor, 100);
      assert.equal(march.receiptsNetMinor, -200);
      assert.equal(march.expensesMinor, 0);
      assert.equal(march.cashFlowMinor, -500);
      assert.equal(march.currentOutstandingMinor, 400);
    } finally {
      await connection.dropDatabase();
      await connection.close();
    }
  },
);
