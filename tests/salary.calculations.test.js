import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateMonthlySalaryCents,
  calculateRentCents,
} from "../src/modules/expenses/salary.calculations.js";
import { POSITION_CODE } from "../src/modules/catalog/catalog.constants.js";

test("salary formulas cover empty groups and enrollment boundaries", () => {
  assert.equal(calculateRentCents(), 5_000_000);
  for (const n of [0, 12]) {
    assert.equal(
      calculateMonthlySalaryCents({
        positionCode: POSITION_CODE.EDUCATOR,
        occupiedSeats: n,
      }),
      4_000_000,
    );
    assert.equal(
      calculateMonthlySalaryCents({
        positionCode: POSITION_CODE.ASSISTANT,
        occupiedSeats: n,
      }),
      2_000_000,
    );
  }
  assert.equal(
    calculateMonthlySalaryCents({
      positionCode: POSITION_CODE.EDUCATOR,
      occupiedSeats: 13,
    }),
    4_500_000,
  );
  assert.equal(
    calculateMonthlySalaryCents({
      positionCode: POSITION_CODE.EDUCATOR,
      occupiedSeats: 20,
    }),
    8_000_000,
  );
  assert.equal(
    calculateMonthlySalaryCents({
      positionCode: POSITION_CODE.ASSISTANT,
      occupiedSeats: 20,
    }),
    4_400_000,
  );
  assert.throws(
    () =>
      calculateMonthlySalaryCents({
        positionCode: "TEACHER",
        occupiedSeats: 0,
        salaryMinor: -1,
      }),
    RangeError,
  );
});
