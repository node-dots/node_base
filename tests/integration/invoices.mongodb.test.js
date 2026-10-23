import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import mongoose from "mongoose";
import { createFixedClock } from "../../src/utils/calendar.js";
import { InvoiceModel } from "../../src/modules/invoices/invoice.model.js";
import { InvoiceRepository } from "../../src/modules/invoices/invoice.repository.js";
import { InvoiceService } from "../../src/modules/invoices/invoice.service.js";
import { UnitOfWork } from "../../src/workflows/unitOfWork.js";
import { authorizer } from "../../src/modules/people/access/authorizer.js";

test(
  "MongoDB: concurrent monthly invoice generation reserves one invoice per child/service/month",
  { skip: process.env.RUN_MONGO_TESTS !== "true" },
  async () => {
    const databaseName = `kindergarten_invoices_${randomUUID().replaceAll("-", "")}`;
    const connection = await mongoose
      .createConnection(
        "mongodb://127.0.0.1:27017/?replicaSet=rs0&directConnection=true",
        { dbName: databaseName, serverSelectionTimeoutMS: 5000 },
      )
      .asPromise();
    try {
      const model = connection.model("Invoice", InvoiceModel.schema);
      await model.init();
      const auditCollection = connection.collection("invoice_test_audit");
      const unitOfWork = new UnitOfWork({
        connection,
        auditWriter: {
          async record(event, { session }) {
            await auditCollection.insertOne(event, { session });
          },
        },
      });
      const child = {
        id: "000000000000000000000001",
        status: "SUSPENDED",
        billingStartMonth: "2026-11",
        ageCategoryId: "000000000000000000000002",
        benefitAssignments: [],
      };
      const service = new InvoiceService({
        invoiceRepository: new InvoiceRepository({ invoiceModel: model }),
        childRepository: {
          async findById() {
            return child;
          },
        },
        catalogRepository: {
          async findLatestValid(kind, code) {
            return {
              kind,
              code,
              effectiveFrom: "2026-01-01",
              amountCents: kind === "TUITION_RATE" ? 1_500_000 : 30_000,
            };
          },
          async findById() {
            return { kind: "AGE_CATEGORY", active: true, age: 2 };
          },
        },
        authorizer,
        unitOfWork,
        clock: createFixedClock("2026-11-04T12:00:00.000Z"),
      });
      const actor = { id: "000000000000000000000003", roles: ["ADMIN"] };
      const results = await Promise.all([
        service.generateForCurrentMonth(child.id, actor, "request-a"),
        service.generateForCurrentMonth(child.id, actor, "request-b"),
      ]);
      assert.equal(await model.countDocuments(), 2);
      assert.ok(results.every(({ invoices }) => invoices.length === 2));
      assert.equal(await auditCollection.countDocuments(), 2);
    } finally {
      await connection.dropDatabase();
      await connection.close();
    }
  },
);
