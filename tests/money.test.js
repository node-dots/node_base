import test from "node:test";
import assert from "node:assert/strict";
import {
  BASIS_POINTS_PER_WHOLE,
  applyDiscount,
  assertBasisPoints,
  assertMoneyMinor,
  calculateAnnualTuition,
  distributeMoney,
  roundRatioHalfUp,
} from "../src/utils/money.js";

test("грошові суми та basis points мають узгоджені одиниці", () => {
  assert.equal(assertMoneyMinor(1_500_000), 1_500_000);
  assert.equal(assertBasisPoints(1_000), 1_000);
  assert.equal(BASIS_POINTS_PER_WHOLE, 10_000);
});

test("half-up округлює половину копійки вгору", () => {
  assert.equal(roundRatioHalfUp(4n, 10n), 0n);
  assert.equal(roundRatioHalfUp(5n, 10n), 1n);
  assert.equal(roundRatioHalfUp(15n, 10n), 2n);
});

test("знижка обчислюється точно без floating-point грошей", () => {
  assert.equal(applyDiscount(1_500_000, 1_000), 1_350_000);
  assert.equal(applyDiscount(1, 5_000), 1);
  assert.equal(applyDiscount(0, 3_000), 0);
  assert.equal(applyDiscount(123, 0), 123);
  assert.equal(applyDiscount(123, 10_000), 0);
});

test("персональна та річна знижки застосовуються послідовно", () => {
  assert.equal(calculateAnnualTuition(1_500_000, 1_000), 14_256_000);

  // Послідовне округлення навмисно відрізняється від одного об'єднаного кроку.
  assert.equal(calculateAnnualTuition(1, 5_000, 5_000), 3);
});

test("розподіл зберігає суму та віддає залишок першим частинам", () => {
  assert.deepEqual(distributeMoney(100, 3), [34, 33, 33]);
  assert.deepEqual(distributeMoney(2, 4), [1, 1, 0, 0]);

  const annualParts = distributeMoney(14_256_000, 12);
  assert.deepEqual(annualParts, Array(12).fill(1_188_000));
  assert.equal(
    annualParts.reduce((sum, part) => sum + part, 0),
    14_256_000,
  );
});

test("некоректні значення відхиляються", () => {
  for (const value of [-1, 1.5, Number.NaN, Infinity, "100", 1n]) {
    assert.throws(() => assertMoneyMinor(value), RangeError);
  }

  for (const value of [-1, 10_001, 0.5, Number.NaN]) {
    assert.throws(() => assertBasisPoints(value), RangeError);
  }

  for (const partCount of [0, -1, 1.5, Number.NaN, 0x1_0000_0000]) {
    assert.throws(() => distributeMoney(100, partCount), RangeError);
  }

  assert.throws(() => roundRatioHalfUp(1, 2n), RangeError);
  assert.throws(() => roundRatioHalfUp(-1n, 2n), RangeError);
  assert.throws(() => roundRatioHalfUp(1n, 0n), RangeError);
});

test("переповнення безпечного цілого відхиляється", () => {
  assert.throws(
    () => calculateAnnualTuition(Number.MAX_SAFE_INTEGER, 0, 0),
    /MAX_SAFE_INTEGER/,
  );

  assert.equal(
    applyDiscount(Number.MAX_SAFE_INTEGER, 0),
    Number.MAX_SAFE_INTEGER,
  );
});
