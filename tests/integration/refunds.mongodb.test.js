import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import mongoose from "mongoose";
import { ChildModel } from "../../src/modules/children/child.model.js";
import { ChildRepository } from "../../src/modules/children/child.repository.js";
import { InvoiceModel } from "../../src/modules/invoices/invoice.model.js";
import { InvoiceRepository } from "../../src/modules/invoices/invoice.repository.js";
import { PaymentModel } from "../../src/modules/payments/payment.model.js";
import { PaymentRepository } from "../../src/modules/payments/payment.repository.js";
import { PaymentService } from "../../src/modules/payments/payment.service.js";
import { RefundModel } from "../../src/modules/payments/refund.model.js";
import { RefundRepository } from "../../src/modules/payments/refund.repository.js";
import { AuditModel } from "../../src/modules/audit/audit.model.js";
import { AuditRepository } from "../../src/modules/audit/audit.repository.js";
import { AuditWriter } from "../../src/modules/audit/audit.writer.js";
import { UnitOfWork } from "../../src/workflows/unitOfWork.js";
import { createFixedClock } from "../../src/utils/calendar.js";
import { authorizer } from "../../src/modules/people/access/authorizer.js";

test(
  "MongoDB: refunds atomically cap receipt/invoice/child due, remain idempotent, and roll back audit failures",
  { skip: process.env.RUN_MONGO_TESTS !== "true" },
  async () => {
    const databaseName = `kindergarten_refunds_${randomUUID().replaceAll("-", "")}`;
    const connection = await mongoose
      .createConnection(
        "mongodb://127.0.0.1:27017/?replicaSet=rs0&directConnection=true",
        { dbName: databaseName, serverSelectionTimeoutMS: 5000 },
      )
      .asPromise();
    try {
      const childModel = connection.model("Child", ChildModel.schema);
      const invoiceModel = connection.model("Invoice", InvoiceModel.schema);
      const paymentModel = connection.model("Payment", PaymentModel.schema);
      const refundModel = connection.model("Refund", RefundModel.schema);
      const auditModel = connection.model("AuditLog", AuditModel.schema);
      await Promise.all([
        childModel.init(),
        invoiceModel.init(),
        paymentModel.init(),
        refundModel.init(),
        auditModel.init(),
      ]);
      const auditWriter = new AuditWriter({
        auditRepository: new AuditRepository({ auditModel }),
        clock: createFixedClock("2027-01-12T12:00:00.000Z"),
      });
      const makeService = (writer = auditWriter) =>
        new PaymentService({
          paymentRepository: new PaymentRepository({ paymentModel }),
          invoiceRepository: new InvoiceRepository({ invoiceModel }),
          childRepository: new ChildRepository({ childModel }),
          refundRepository: new RefundRepository({ refundModel }),
          authorizer,
          unitOfWork: new UnitOfWork({ connection, auditWriter: writer }),
          clock: createFixedClock("2027-01-12T12:00:00.000Z"),
        });
      const service = makeService();
      const adminId = new mongoose.Types.ObjectId();
      const childId = new mongoose.Types.ObjectId();
      const invoiceId = new mongoose.Types.ObjectId();
      const paymentId = new mongoose.Types.ObjectId();
      const guardianId = new mongoose.Types.ObjectId();
      await childModel.create({
        _id: childId,
        firstName: "Withdrawn",
        lastName: "Child",
        dateOfBirth: "2022-05-12",
        status: "LEFT",
        guardians: [{ personId: guardianId, relationship: "parent" }],
        leftAt: new Date("2027-01-12T12:00:00.000Z"),
        billingEndMonth: "2027-02",
        withdrawalSummary: {
          withdrawnAt: new Date("2027-01-12T12:00:00.000Z"),
          billingEndMonth: "2027-02",
          obligationCents: 3_564_000,
          refundDueCents: 10_692_000,
        },
      });
      const parts = Array.from({ length: 12 }, (_, index) => ({
        month: new Date(Date.UTC(2026, 10 + index, 1))
          .toISOString()
          .slice(0, 7),
        amountCents: 1_188_000,
        remainingCents: 0,
      }));
      await invoiceModel.create({
        _id: invoiceId,
        childId,
        service: "TUITION",
        billingType: "ANNUAL",
        serviceMonth: "2026-11",
        status: "PAID",
        origAmountCents: 14_256_000,
        remainingAmountCents: 0,
        paidAmountCents: 14_256_000,
        refundableAmountCents: 10_692_000,
        refundedAmountCents: 0,
        tariffSnapshot: {
          code: "TUITION_MONTHLY",
          effectiveFrom: "2026-01-01",
          amountCents: 1_500_000,
        },
        formula: "annual tuition",
        dueAt: new Date("2026-10-31T21:59:59.999Z"),
        parts,
      });
      await paymentModel.create({
        _id: paymentId,
        invoiceId,
        amountCents: 14_256_000,
        refundedAmountCents: 0,
        method: "BANK_TRANSFER",
        status: "CONFIRMED",
        payerPersonId: guardianId,
        actorId: guardianId,
        idempotencyKey: "confirmed-receipt-1",
        payloadHash: "a".repeat(64),
        reportedAt: new Date("2026-10-20T12:00:00.000Z"),
        occurredAt: new Date("2026-10-20T12:00:00.000Z"),
        confirmedAt: new Date("2026-10-21T12:00:00.000Z"),
        reviewedById: adminId,
      });
      const actor = { id: adminId.toString(), roles: ["ADMIN"] };
      const body = {
        amountCents: 10_692_000,
        reason: "Annual tuition after withdrawal",
      };
      const refundKeys = ["refund-annual-a", "refund-annual-b"];
      const simultaneous = await Promise.allSettled(
        refundKeys.map((idempotencyKey) =>
          service.refund(
            paymentId.toString(),
            { ...body, idempotencyKey },
            actor,
            idempotencyKey,
          ),
        ),
      );
      assert.equal(
        simultaneous.filter(({ status }) => status === "fulfilled").length,
        1,
      );
      assert.equal(
        simultaneous.filter(({ status }) => status === "rejected").length,
        1,
      );
      const successfulIndex = simultaneous.findIndex(
        ({ status }) => status === "fulfilled",
      );
      const refundKey = refundKeys[successfulIndex];
      const successfulBody = { ...body, idempotencyKey: refundKey };
      const repeated = await service.refund(
        paymentId.toString(),
        successfulBody,
        actor,
        "refund-repeat",
      );
      assert.deepEqual(repeated, simultaneous[successfulIndex].value);
      await assert.rejects(
        service.refund(
          paymentId.toString(),
          { ...successfulBody, amountCents: 10_691_000 },
          actor,
          "refund-key-conflict",
        ),
        { code: "REFUND_IDEMPOTENCY_KEY_CONFLICT" },
      );
      const [invoice, payment, child] = await Promise.all([
        invoiceModel.findById(invoiceId).lean(),
        paymentModel.findById(paymentId).lean(),
        childModel.findById(childId).lean(),
      ]);
      assert.equal(invoice.origAmountCents, 14_256_000);
      assert.equal(invoice.paidAmountCents, 14_256_000);
      assert.equal(invoice.refundableAmountCents, 0);
      assert.equal(invoice.refundedAmountCents, 10_692_000);
      assert.equal(payment.amountCents, 14_256_000);
      assert.equal(payment.refundedAmountCents, 10_692_000);
      assert.equal(child.withdrawalSummary.refundDueCents, 0);
      assert.equal(await refundModel.countDocuments(), 1);
      assert.equal(
        await auditModel.countDocuments({ action: "payment.refund.record" }),
        1,
      );

      const secondChildId = new mongoose.Types.ObjectId();
      const secondInvoiceId = new mongoose.Types.ObjectId();
      const secondPaymentId = new mongoose.Types.ObjectId();
      await childModel.create({
        _id: secondChildId,
        firstName: "Rollback",
        lastName: "Child",
        dateOfBirth: "2022-05-12",
        status: "LEFT",
        guardians: [{ personId: guardianId, relationship: "parent" }],
        withdrawalSummary: {
          withdrawnAt: new Date("2027-01-12T12:00:00.000Z"),
          billingEndMonth: "2027-02",
          obligationCents: 0,
          refundDueCents: 500,
        },
      });
      await invoiceModel.create({
        _id: secondInvoiceId,
        childId: secondChildId,
        service: "TUITION",
        billingType: "MONTHLY",
        serviceMonth: "2027-01",
        status: "PAID",
        origAmountCents: 500,
        remainingAmountCents: 0,
        paidAmountCents: 500,
        refundableAmountCents: 500,
        tariffSnapshot: {
          code: "TUITION_MONTHLY",
          effectiveFrom: "2027-01-01",
          amountCents: 500,
        },
        formula: "500",
        dueAt: new Date("2027-01-10T21:59:59.999Z"),
        parts: [{ month: "2027-01", amountCents: 500, remainingCents: 0 }],
      });
      await paymentModel.create({
        _id: secondPaymentId,
        invoiceId: secondInvoiceId,
        amountCents: 500,
        method: "CASH",
        status: "CONFIRMED",
        payerPersonId: guardianId,
        actorId: guardianId,
        idempotencyKey: "confirmed-receipt-2",
        payloadHash: "b".repeat(64),
        reportedAt: new Date(),
        occurredAt: new Date(),
        confirmedAt: new Date(),
        reviewedById: adminId,
      });
      const failingService = makeService({
        async record() {
          throw new Error("audit unavailable");
        },
      });
      await assert.rejects(
        failingService.refund(
          secondPaymentId.toString(),
          {
            amountCents: 500,
            reason: "Refund audit rollback",
            idempotencyKey: "refund-rollback-0001",
          },
          actor,
          "refund-audit-failure",
        ),
        /audit unavailable/,
      );
      const [invoiceAfterRollback, paymentAfterRollback, childAfterRollback] =
        await Promise.all([
          invoiceModel.findById(secondInvoiceId).lean(),
          paymentModel.findById(secondPaymentId).lean(),
          childModel.findById(secondChildId).lean(),
        ]);
      assert.equal(invoiceAfterRollback.refundableAmountCents, 500);
      assert.equal(invoiceAfterRollback.refundedAmountCents, 0);
      assert.equal(paymentAfterRollback.refundedAmountCents, 0);
      assert.equal(childAfterRollback.withdrawalSummary.refundDueCents, 500);
      assert.equal(
        await refundModel.countDocuments({ paymentId: secondPaymentId }),
        0,
      );
    } finally {
      try {
        await connection.dropDatabase();
      } finally {
        await connection.close();
      }
    }
  },
);
