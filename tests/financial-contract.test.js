import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const fixture = JSON.parse(
  await readFile(
    new URL("./fixtures/finance/monthly-report.json", import.meta.url),
    "utf8",
  ),
);

const utcMonth = (timestamp) => timestamp.slice(0, 7);

test("financial fixture розділяє accrual, cash та current balances", () => {
  const accruedIncomeMinor = fixture.invoiceParts
    .filter((part) => part.active && part.serviceMonth === fixture.month)
    .reduce((sum, part) => sum + part.amountMinor, 0);

  const receiptsNetMinor = fixture.moneyEvents
    .filter(
      (event) =>
        event.status === "CONFIRMED" &&
        utcMonth(event.occurredAt) === fixture.month,
    )
    .reduce(
      (sum, event) =>
        sum +
        (event.kind === "RECEIPT" ? event.amountMinor : -event.amountMinor),
      0,
    );

  const expensesMinor = fixture.expenses
    .filter(
      (expense) =>
        expense.status === "APPROVED" && expense.serviceMonth === fixture.month,
    )
    .reduce((sum, expense) => sum + expense.amountMinor, 0);

  const paidExpensesMinor = fixture.expenses
    .filter(
      (expense) =>
        expense.paidAt !== null && utcMonth(expense.paidAt) === fixture.month,
    )
    .reduce((sum, expense) => sum + expense.amountMinor, 0);

  const currentOutstandingMinor = fixture.currentInvoices.reduce(
    (sum, invoice) =>
      sum +
      Math.max(0, invoice.obligationMinor - invoice.confirmedNetPaidMinor),
    0,
  );
  const currentOverdueMinor = fixture.currentInvoices
    .filter((invoice) => invoice.dueAt < fixture.asOf)
    .reduce(
      (sum, invoice) =>
        sum +
        Math.max(0, invoice.obligationMinor - invoice.confirmedNetPaidMinor),
      0,
    );
  const currentRefundDueMinor = fixture.currentInvoices.reduce(
    (sum, invoice) =>
      sum +
      Math.max(0, invoice.confirmedNetPaidMinor - invoice.obligationMinor),
    0,
  );

  assert.deepEqual(
    {
      accruedIncomeMinor,
      receiptsNetMinor,
      expensesMinor,
      resultMinor: accruedIncomeMinor - expensesMinor,
      paidExpensesMinor,
      cashFlowMinor: receiptsNetMinor - paidExpensesMinor,
      currentOutstandingMinor,
      currentOverdueMinor,
      currentRefundDueMinor,
    },
    fixture.expected,
  );
});

test("контрольні 300 дітей дають точний результат §17", () => {
  const children = 300;
  const tuitionMinor = 1_500_000;
  const personalDiscountFactorBps = 9_500;
  const annualMixFactorBps = 8_000 + (2_000 * 8_800) / 10_000;
  const incomeMinor =
    (children * tuitionMinor * personalDiscountFactorBps * annualMixFactorBps) /
    10_000 ** 2;
  const expensesMinor = 186_000_000 + 61_000_000;

  assert.equal(incomeMinor, 417_240_000);
  assert.equal(expensesMinor, 247_000_000);
  assert.equal(incomeMinor - expensesMinor, 170_240_000);
});
