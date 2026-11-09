import { applyDiscount, assertMoneyMinor } from "../../utils/money.js";
import { calculateMonthlySalaryCents } from "../expenses/salary.calculations.js";

const MAX_GROUPS = 15;
const MAX_DEMAND = 10_000;
const assertSignedMinor = (value) => {
  if (!Number.isSafeInteger(value))
    throw new RangeError("Scenario result exceeds safe integer precision");
  return value;
};

function assertScenario(input) {
  if (
    !input ||
    !Array.isArray(input.groups) ||
    !Array.isArray(input.ages) ||
    !Array.isArray(input.discountMix) ||
    !Array.isArray(input.staff)
  )
    throw new RangeError(
      "Scenario must include groups, ages, discountMix, and staff arrays",
    );
  if (input.groups.length > MAX_GROUPS || input.groups.length === 0)
    throw new RangeError(`groups must contain 1-${MAX_GROUPS} active groups`);
  const groupIds = new Set();
  for (const group of input.groups) {
    if (
      typeof group.id !== "string" ||
      groupIds.has(group.id) ||
      !Number.isSafeInteger(group.capacity) ||
      group.capacity < 1 ||
      !Number.isSafeInteger(group.age)
    )
      throw new RangeError(
        "Each group needs a unique id, age, and positive capacity",
      );
    groupIds.add(group.id);
  }
  const ageCodes = new Set();
  for (const age of input.ages) {
    if (
      typeof age.code !== "string" ||
      ageCodes.has(age.code) ||
      !Number.isSafeInteger(age.demand) ||
      age.demand < 0 ||
      age.demand > MAX_DEMAND ||
      !Number.isSafeInteger(age.tariffMinor) ||
      age.tariffMinor < 0
    )
      throw new RangeError(
        "Age categories require unique codes, bounded demand, and a non-negative tariff",
      );
    ageCodes.add(age.code);
  }
  const discountTotal = input.discountMix.reduce(
    (sum, item) => sum + item.shareBasisPoints,
    0,
  );
  if (
    input.discountMix.length === 0 ||
    discountTotal !== 10_000 ||
    input.discountMix.some(
      (item) =>
        !Number.isSafeInteger(item.basisPoints) ||
        item.basisPoints < 0 ||
        item.basisPoints > 10_000 ||
        !Number.isSafeInteger(item.shareBasisPoints) ||
        item.shareBasisPoints < 0,
    )
  )
    throw new RangeError("discountMix shares must total 10000 basis points");
  for (const staff of input.staff)
    if (
      !groupIds.has(staff.groupId) ||
      typeof staff.positionCode !== "string" ||
      !Number.isSafeInteger(staff.salaryMinor) ||
      staff.salaryMinor < 0
    )
      throw new RangeError(
        "Staff must refer to a scenario group and have a valid salary",
      );
  assertMoneyMinor(input.rentMinor);
  if (input.foodCostMinor !== undefined) assertMoneyMinor(input.foodCostMinor);
  if (!Array.isArray(input.otherCosts))
    throw new RangeError("otherCosts must be an array");
  for (const cost of input.otherCosts) assertMoneyMinor(cost.amountMinor);
}

function distribute(count, groups) {
  const sorted = [...groups].sort((a, b) => a.id.localeCompare(b.id));
  return sorted.map((group, index) => ({
    groupId: group.id,
    count:
      Math.floor(count / sorted.length) +
      (index < count % sorted.length ? 1 : 0),
  }));
}

function allocation(input, demandByCode) {
  const result = [];
  for (const age of [...input.ages].sort(
    (a, b) => a.age - b.age || a.code.localeCompare(b.code),
  )) {
    const groups = input.groups.filter((group) => group.age === age.age);
    const demand = demandByCode[age.code] ?? 0;
    const seats = groups.reduce((sum, group) => sum + group.capacity, 0);
    if (!groups.length && demand)
      throw new RangeError(`No groups configured for age ${age.code}`);
    result.push({
      ageCode: age.code,
      demand,
      seats,
      overCapacity: demand > seats,
      placements: groups.length ? distribute(demand, groups) : [],
    });
  }
  return result;
}

function expectedRevenue(age, demand, mix) {
  let total = 0;
  for (const discount of mix) {
    const numerator =
      applyDiscount(age.tariffMinor, discount.basisPoints) *
      demand *
      discount.shareBasisPoints;
    if (!Number.isSafeInteger(numerator))
      throw new RangeError("Scenario revenue exceeds safe integer precision");
    total += Math.floor(numerator / 10_000);
  }
  return assertMoneyMinor(total);
}

export function calculateFinancialForecast(
  input,
  {
    demandByCode = Object.fromEntries(
      input.ages.map((age) => [age.code, age.demand]),
    ),
  } = {},
) {
  assertScenario(input);
  const placement = allocation(input, demandByCode);
  const occupantsByGroup = new Map(input.groups.map((group) => [group.id, 0]));
  for (const age of placement)
    for (const row of age.placements)
      occupantsByGroup.set(row.groupId, row.count);
  const revenueMinor = input.ages.reduce(
    (sum, age) =>
      sum +
      expectedRevenue(age, demandByCode[age.code] ?? 0, input.discountMix),
    0,
  );
  const payrollMinor = input.staff.reduce(
    (sum, staff) =>
      sum +
      calculateMonthlySalaryCents({
        positionCode: staff.positionCode,
        occupiedSeats: occupantsByGroup.get(staff.groupId),
        salaryMinor: staff.salaryMinor,
      }),
    0,
  );
  const rentMinor = input.rentMinor;
  const otherCostsMinor = input.otherCosts.reduce(
    (sum, item) => sum + item.amountMinor,
    0,
  );
  const foodCostMinor = input.foodCostMinor;
  const knownCostsMinor = assertMoneyMinor(
    payrollMinor + rentMinor + otherCostsMinor,
  );
  const resultBeforeFoodMinor = assertSignedMinor(
    revenueMinor - knownCostsMinor,
  );
  const complete = Number.isSafeInteger(foodCostMinor);
  const resultMinor = complete
    ? assertSignedMinor(resultBeforeFoodMinor - foodCostMinor)
    : null;
  return {
    revenueMinor,
    payrollMinor,
    rentMinor,
    otherCostsMinor,
    foodCostMinor: complete ? foodCostMinor : null,
    knownCostsMinor,
    resultBeforeFoodMinor,
    resultMinor,
    complete,
    costBreakdown: {
      payrollMinor,
      rentMinor,
      otherCosts: input.otherCosts.map((item) => ({
        code: item.code,
        amountMinor: item.amountMinor,
      })),
      foodCostMinor: complete ? foodCostMinor : null,
    },
    placement,
    assumptions: [
      "Stable-month tuition excludes the free enrollment remainder",
      "Children are distributed evenly within each age across configured groups",
      "Discount mix is a deterministic weighted scenario, not an observed collection",
      "Forecast does not confirm schedule feasibility",
      ...(complete
        ? []
        : [
            "Food cost is missing; result is incomplete and is not full profit",
          ]),
    ],
  };
}

export function findFinancialBreakeven(
  input,
  { maxCandidates = MAX_DEMAND } = {},
) {
  assertScenario(input);
  if (
    !Number.isSafeInteger(maxCandidates) ||
    maxCandidates < 0 ||
    maxCandidates > MAX_DEMAND
  )
    throw new RangeError(`maxCandidates must be between 0 and ${MAX_DEMAND}`);
  const ages = [...input.ages].sort(
    (a, b) => a.age - b.age || a.code.localeCompare(b.code),
  );
  const demand = Object.fromEntries(ages.map((age) => [age.code, 0]));
  let candidatesChecked = 0;
  let lastCandidate = null;
  let cursor = 0;
  for (let total = 0; total <= maxCandidates; total += 1) {
    const forecast = calculateFinancialForecast(input, {
      demandByCode: demand,
    });
    candidatesChecked += 1;
    lastCandidate = {
      children: total,
      resultBeforeFoodMinor: forecast.resultBeforeFoodMinor,
      feasibleWithinCapacity: forecast.placement.every(
        (row) => row.demand <= row.seats,
      ),
    };
    if (
      forecast.resultBeforeFoodMinor >= 0 &&
      lastCandidate.feasibleWithinCapacity
    )
      return {
        breakevenChildren: total,
        demandByAge: { ...demand },
        resultBeforeFoodMinor: forecast.resultBeforeFoodMinor,
        complete: forecast.complete,
        candidatesChecked,
        sequence:
          "largest proportional share deficit first; lower age breaks ties",
        assumptions: forecast.assumptions,
      };
    if (total === maxCandidates || ages.length === 0) break;
    const eligible = ages.filter(
      (age) =>
        demand[age.code] < age.demand &&
        demand[age.code] <
          input.groups
            .filter((group) => group.age === age.age)
            .reduce((sum, group) => sum + group.capacity, 0),
    );
    if (!eligible.length) break;
    eligible.sort((a, b) => {
      const deficitA = a.demand ? demand[a.code] / a.demand : 1;
      const deficitB = b.demand ? demand[b.code] / b.demand : 1;
      return (
        deficitA - deficitB || a.age - b.age || a.code.localeCompare(b.code)
      );
    });
    demand[eligible[0].code] += 1;
    cursor += 1;
  }
  return {
    breakevenChildren: null,
    demandByAge: { ...demand },
    resultBeforeFoodMinor: lastCandidate?.resultBeforeFoodMinor ?? null,
    complete: false,
    candidatesChecked,
    sequence: "largest proportional share deficit first; lower age breaks ties",
    explanation: cursor
      ? "The allowed demand and capacity sequence did not reach a non-negative result"
      : "No children can be added under the configured demand and capacity",
    assumptions: [
      "This is financial breakeven for fixed resources, not minimum group count",
      "Breakeven does not confirm schedule feasibility",
    ],
  };
}
