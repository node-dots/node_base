import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateFinancialForecast,
  findFinancialBreakeven,
} from "../src/modules/finance/scenario.calculations.js";
import { FinancialScenarioService } from "../src/modules/finance/scenario.service.js";
import { authorizer } from "../src/modules/people/access/authorizer.js";

function controlScenario(demand = 108, foodCostMinor) {
  const groups = Array.from({ length: 15 }, (_, i) => ({
    id: `g${String(i).padStart(2, "0")}`,
    age: 3,
    capacity: 12,
  }));
  const staff = groups.flatMap((group) => [
    { groupId: group.id, positionCode: "EDUCATOR", salaryMinor: 0 },
    { groupId: group.id, positionCode: "ASSISTANT", salaryMinor: 0 },
  ]);
  return {
    groups,
    ages: [{ code: "AGE_3", age: 3, demand, tariffMinor: 1_390_800 }],
    discountMix: [{ basisPoints: 0, shareBasisPoints: 10_000 }],
    staff,
    rentMinor: 0,
    otherCosts: [{ code: "OTHER", amountMinor: 61_000_000 }],
    ...(foodCostMinor === undefined ? {} : { foodCostMinor }),
  };
}

test("control model reaches the required 108/109 child results exactly", () => {
  const at108 = calculateFinancialForecast(controlScenario(108));
  const at109 = calculateFinancialForecast(controlScenario(109));
  assert.equal(at108.resultBeforeFoodMinor, -793_600);
  assert.equal(at109.resultBeforeFoodMinor, 597_200);
  assert.equal(at108.resultMinor, null);
  assert.equal(at108.complete, false);
  assert.match(at108.assumptions.join(" "), /Food cost is missing/);
});

test("fixed-resource breakeven scans the deterministic demand sequence", () => {
  const result = findFinancialBreakeven(controlScenario(109));
  assert.equal(result.breakevenChildren, 109);
  assert.equal(result.resultBeforeFoodMinor, 597_200);
  assert.equal(result.candidatesChecked, 110);
  assert.equal(result.demandByAge.AGE_3, 109);
});

test("empty groups keep their base salaries and demand is evenly distributed", () => {
  const scenario = controlScenario(1, 0);
  scenario.groups[14] = { id: "g-empty", age: 3, capacity: 12 };
  scenario.staff = scenario.staff.filter((member) => member.groupId !== "g14");
  scenario.staff.push(
    { groupId: "g-empty", positionCode: "EDUCATOR", salaryMinor: 0 },
    { groupId: "g-empty", positionCode: "ASSISTANT", salaryMinor: 0 },
  );
  const result = calculateFinancialForecast(scenario);
  assert.equal(
    result.placement[0].placements.find((row) => row.groupId === "g00").count,
    0,
  );
  assert.equal(
    result.placement[0].placements.find((row) => row.groupId === "g-empty")
      .count,
    1,
  );
  assert.equal(result.payrollMinor, 90_000_000);
});

test("invalid discount mix, duplicate groups and unsafe bounds reject", () => {
  assert.throws(
    () =>
      calculateFinancialForecast({
        ...controlScenario(),
        discountMix: [{ basisPoints: 100, shareBasisPoints: 9000 }],
      }),
    /shares must total/,
  );
  const duplicate = controlScenario();
  duplicate.groups[1].id = duplicate.groups[0].id;
  assert.throws(() => calculateFinancialForecast(duplicate), /unique id/);
  assert.throws(
    () => findFinancialBreakeven(controlScenario(), { maxCandidates: 10_001 }),
    /maxCandidates/,
  );
});

test("finance scenario service allows ADMIN and denies MANAGER", () => {
  const service = new FinancialScenarioService({ authorizer });
  assert.equal(
    service.forecast(controlScenario(109), { id: "admin", roles: ["ADMIN"] })
      .resultBeforeFoodMinor,
    597_200,
  );
  assert.throws(
    () =>
      service.forecast(controlScenario(109), {
        id: "manager",
        roles: ["MANAGER"],
      }),
    { status: 403 },
  );
});
