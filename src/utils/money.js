export const BASIS_POINTS_PER_WHOLE = 10_000;

function assertSafeNonNegativeInteger(value, name) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative safe integer`);
  }

  return value;
}

/**
 * Validates an amount expressed in the smallest currency unit (kopiykas for UAH).
 */
export function assertMoneyMinor(moneyMinor, name = "moneyMinor") {
  return assertSafeNonNegativeInteger(moneyMinor, name);
}

/**
 * Validates a percentage expressed in basis points (10_000 = 100%).
 */
export function assertBasisPoints(basisPoints, name = "basisPoints") {
  assertSafeNonNegativeInteger(basisPoints, name);

  if (basisPoints > BASIS_POINTS_PER_WHOLE) {
    throw new RangeError(
      `${name} must be between 0 and ${BASIS_POINTS_PER_WHOLE}`,
    );
  }

  return basisPoints;
}

function toSafeNumber(value, name) {
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new RangeError(`${name} exceeds Number.MAX_SAFE_INTEGER`);
  }

  return Number(value);
}

/**
 * Divides non-negative integers using round-half-up semantics.
 * BigInt keeps intermediate multiplication exact.
 */
export function roundRatioHalfUp(numerator, denominator) {
  if (typeof numerator !== "bigint" || numerator < 0n) {
    throw new RangeError("numerator must be a non-negative BigInt");
  }

  if (typeof denominator !== "bigint" || denominator <= 0n) {
    throw new RangeError("denominator must be a positive BigInt");
  }

  const quotient = numerator / denominator;
  const remainder = numerator % denominator;

  return remainder * 2n >= denominator ? quotient + 1n : quotient;
}

/**
 * Applies a discount to a money amount and returns whole minor units.
 */
export function applyDiscount(moneyMinor, discountBasisPoints) {
  assertMoneyMinor(moneyMinor);
  assertBasisPoints(discountBasisPoints, "discountBasisPoints");

  const retainedBasisPoints = BASIS_POINTS_PER_WHOLE - discountBasisPoints;
  const result = roundRatioHalfUp(
    BigInt(moneyMinor) * BigInt(retainedBasisPoints),
    BigInt(BASIS_POINTS_PER_WHOLE),
  );

  return toSafeNumber(result, "discounted moneyMinor");
}

/**
 * Calculates a twelve-month tuition amount. The personal discount is rounded
 * first; the annual discount is then applied to that result.
 */
export function calculateAnnualTuition(
  monthlyTariffMinor,
  personalDiscountBasisPoints,
  annualDiscountBasisPoints = 1_200,
) {
  assertMoneyMinor(monthlyTariffMinor, "monthlyTariffMinor");
  assertBasisPoints(personalDiscountBasisPoints, "personalDiscountBasisPoints");
  assertBasisPoints(annualDiscountBasisPoints, "annualDiscountBasisPoints");

  const annualBeforeDiscounts = toSafeNumber(
    BigInt(monthlyTariffMinor) * 12n,
    "annual tariff moneyMinor",
  );
  const afterPersonalDiscount = applyDiscount(
    annualBeforeDiscounts,
    personalDiscountBasisPoints,
  );

  return applyDiscount(afterPersonalDiscount, annualDiscountBasisPoints);
}

/**
 * Splits an amount deterministically. Any remainder is assigned one minor unit
 * at a time to the earliest parts.
 */
export function distributeMoney(moneyMinor, partCount) {
  assertMoneyMinor(moneyMinor);

  if (!Number.isSafeInteger(partCount) || partCount <= 0) {
    throw new RangeError("partCount must be a positive safe integer");
  }

  // An Array cannot contain more than 2^32 - 1 entries in JavaScript.
  if (partCount > 0xffff_ffff) {
    throw new RangeError("partCount exceeds the maximum array length");
  }

  const money = BigInt(moneyMinor);
  const parts = BigInt(partCount);
  const basePart = toSafeNumber(money / parts, "distributed moneyMinor");
  const remainder = toSafeNumber(money % parts, "distribution remainder");

  return Array.from(
    { length: partCount },
    (_, index) => basePart + (index < remainder ? 1 : 0),
  );
}
