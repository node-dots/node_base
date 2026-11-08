import { POSITION_CODE } from "../catalog/catalog.constants.js";

const FIXED_CENTS = Object.freeze({
  RENT: 5_000_000,
  EDUCATOR_BASE: 4_000_000,
  EDUCATOR_PER_CHILD: 500_000,
  ASSISTANT_BASE: 2_000_000,
  ASSISTANT_PER_CHILD: 300_000,
});

export function calculateMonthlySalaryCents({
  positionCode,
  occupiedSeats,
  salaryMinor,
}) {
  if (!Number.isSafeInteger(occupiedSeats) || occupiedSeats < 0)
    throw new RangeError("occupiedSeats must be a non-negative safe integer");
  const excess = Math.max(0, occupiedSeats - 12);
  if (positionCode === POSITION_CODE.EDUCATOR)
    return FIXED_CENTS.EDUCATOR_BASE + FIXED_CENTS.EDUCATOR_PER_CHILD * excess;
  if (positionCode === POSITION_CODE.ASSISTANT)
    return (
      FIXED_CENTS.ASSISTANT_BASE + FIXED_CENTS.ASSISTANT_PER_CHILD * excess
    );
  if (!Number.isSafeInteger(salaryMinor) || salaryMinor < 0)
    throw new RangeError("salaryMinor must be a non-negative safe integer");
  return salaryMinor;
}

export function calculateRentCents() {
  return FIXED_CENTS.RENT;
}
