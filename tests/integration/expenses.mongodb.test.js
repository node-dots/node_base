import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import mongoose from "mongoose";
import { ExpenseModel } from "../../src/modules/expenses/expense.model.js";
import { ExpenseRepository } from "../../src/modules/expenses/expense.repository.js";

test(
  "MongoDB: expense approval period and payment cash-flow dates remain separate; concurrent pay applies once",
  { skip: process.env.RUN_MONGO_TESTS !== "true" },
  async () => {
    const connection = await mongoose
      .createConnection(
        "mongodb://127.0.0.1:27017/?replicaSet=rs0&directConnection=true",
        {
          dbName: `expenses_${randomUUID().replaceAll("-", "")}`,
          serverSelectionTimeoutMS: 5000,
        },
      )
      .asPromise();
    try {
      const model = connection.model("Expense", ExpenseModel.schema);
      await model.init();
      const repo = new ExpenseRepository({ expenseModel: model });
      const expense = await repo.insert({
        category: "FOOD",
        amountCents: 25000,
        serviceMonth: "2026-01",
        reason: "January meals",
      });
      assert.ok(await repo.approve(expense.id));
      const paid = await Promise.all([
        repo.pay(expense.id, "2026-02-03", new Date()),
        repo.pay(expense.id, "2026-02-03", new Date()),
      ]);
      assert.equal(paid.filter(Boolean).length, 1);
      assert.equal(await repo.sumApproved("2026-01"), 25000);
      assert.equal(await repo.sumCashFlow("2026-02"), 25000);
      const cancelled = await repo.insert({
        category: "OTHER",
        amountCents: 1000,
        serviceMonth: "2026-01",
        reason: "cancelled draft",
      });
      await repo.cancel(cancelled.id);
      assert.equal(await repo.sumApproved("2026-01"), 25000);
    } finally {
      await connection.dropDatabase();
      await connection.close();
    }
  },
);
