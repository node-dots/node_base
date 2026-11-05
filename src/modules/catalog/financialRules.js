import { AppError } from "../../utils/errors.js";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export function assertEffectiveDate(value) {
  if (typeof value !== "string" || !DATE.test(value)) {
    throw new AppError(
      400,
      "INVALID_EFFECTIVE_DATE",
      "Date must use YYYY-MM-DD",
    );
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (
    Number.isNaN(parsed.valueOf()) ||
    parsed.toISOString().slice(0, 10) !== value
  ) {
    throw new AppError(
      400,
      "INVALID_EFFECTIVE_DATE",
      "Effective date is invalid",
    );
  }
  return parsed;
}

export function firstDayOfNextMonth(date) {
  const parsed = assertEffectiveDate(date);
  return new Date(
    Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth() + 1, 1),
  )
    .toISOString()
    .slice(0, 10);
}

export function validateFinancialVersion({ effectiveFrom, today }) {
  assertEffectiveDate(effectiveFrom);
  if (effectiveFrom.slice(-2) !== "01") {
    throw new AppError(
      400,
      "INVALID_EFFECTIVE_DATE",
      "Financial versions begin on the first day of a month",
    );
  }
  const earliest = firstDayOfNextMonth(today);
  if (effectiveFrom < earliest) {
    throw new AppError(
      400,
      "RETROACTIVE_FINANCIAL_CHANGE",
      "Financial versions may only start next month or later",
    );
  }
  return effectiveFrom;
}

export function latestValidVersion(versions, date, { kind, code } = {}) {
  assertEffectiveDate(date);
  const selected = versions
    .filter(
      (entry) =>
        entry.active !== false &&
        entry.effectiveFrom <= date &&
        (!kind || entry.kind === kind) &&
        (!code || entry.code === code),
    )
    .sort((left, right) =>
      right.effectiveFrom.localeCompare(left.effectiveFrom),
    )[0];
  if (!selected)
    throw new AppError(
      404,
      "FINANCIAL_VERSION_NOT_FOUND",
      "No valid rule exists for the requested date",
    );
  return structuredClone(selected);
}

export function createBenefitAssignment({
  benefit,
  startMonth,
  endMonth,
  existing = [],
  today,
}) {
  if (!benefit || benefit.kind !== "BENEFIT" || benefit.active === false) {
    throw new AppError(
      400,
      "INVALID_BENEFIT",
      "An active benefit rule is required",
    );
  }
  if (
    !/^\d{4}-\d{2}$/.test(startMonth) ||
    (endMonth && !/^\d{4}-\d{2}$/.test(endMonth))
  ) {
    throw new AppError(
      400,
      "INVALID_BENEFIT_PERIOD",
      "Benefit period must use YYYY-MM",
    );
  }
  if (startMonth < firstDayOfNextMonth(today).slice(0, 7)) {
    throw new AppError(
      400,
      "RETROACTIVE_BENEFIT",
      "Benefit changes may only start next month or later",
    );
  }
  if (endMonth && endMonth < startMonth)
    throw new AppError(
      400,
      "INVALID_BENEFIT_PERIOD",
      "Benefit end precedes its start",
    );
  if (existing.length >= 100)
    throw new AppError(
      409,
      "BENEFIT_HISTORY_LIMIT",
      "Benefit history limit reached",
    );
  const start = `${startMonth}-01`;
  const endExclusive = endMonth ? `${endMonth}-99` : "9999-99-99";
  const overlaps = existing.some((item) => {
    const itemEnd = item.endMonth ? `${item.endMonth}-99` : "9999-99-99";
    return start <= itemEnd && `${item.startMonth}-01` <= endExclusive;
  });
  if (overlaps)
    throw new AppError(
      409,
      "BENEFIT_PERIOD_OVERLAP",
      "Benefit periods cannot overlap",
    );
  return {
    benefitCode: benefit.code,
    basisPoints: benefit.basisPoints,
    startMonth,
    ...(endMonth ? { endMonth } : {}),
  };
}
