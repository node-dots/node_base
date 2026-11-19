import test from "node:test";
import assert from "node:assert/strict";
import { searchConfigurations } from "../src/modules/finance/configurationSearch.js";
import { ConfigurationSearchService } from "../src/modules/finance/configurationSearch.service.js";
import { authorizer } from "../src/modules/people/access/authorizer.js";
import { configurationSearchSchema } from "../src/modules/finance/configurationSearch.schema.js";

function scenario() {
  const availability = [{ weekday: 1, startTime: "09:00", endTime: "17:00" }];
  return {
    weekStart: "2026-11-02",
    schoolYear: "2026-2027",
    groupRanges: [
      { ageCode: "AGE_3", age: 3, children: 2, minGroups: 1, maxGroups: 2 },
    ],
    rooms: [{ id: "room-1", active: true, roomType: "GROUP", capacity: 2 }],
    teacherVariants: [
      {
        id: "variant-b",
        teachers: [{ id: "teacher-b", subjectCode: "MATH", availability }],
      },
      {
        id: "variant-a",
        teachers: [{ id: "teacher-a", subjectCode: "MATH", availability }],
      },
    ],
    program: [{ subjectCode: "MATH", sessionsPerWeek: 1, durationMinutes: 30 }],
    fixedStaff: [],
    financial: {
      ages: [{ code: "AGE_3", age: 3, demand: 2, tariffMinor: 10_000_000 }],
      discountMix: [{ basisPoints: 0, shareBasisPoints: 10_000 }],
      rentMinor: 0,
      otherCosts: [],
      foodCostMinor: 0,
    },
  };
}

function fixedDemandScenario(children = 20) {
  const availability = [{ weekday: 1, startTime: "09:00", endTime: "17:00" }];
  return {
    weekStart: "2026-11-02",
    schoolYear: "2026-2027",
    groupRanges: [
      { ageCode: "AGE_3", age: 3, children, minGroups: 1, maxGroups: 2 },
    ],
    rooms: [
      { id: "room-1", active: true, roomType: "GROUP", capacity: 20 },
      { id: "room-2", active: true, roomType: "GROUP", capacity: 20 },
    ],
    teacherVariants: [
      {
        id: "one-teacher",
        teachers: [
          {
            id: "teacher-1",
            subjectCode: "MATH",
            availability,
            salaryMinor: 4_000_000,
          },
        ],
      },
      {
        id: "two-teachers",
        teachers: [
          {
            id: "teacher-2",
            subjectCode: "MATH",
            availability,
            salaryMinor: 3_000_000,
          },
          {
            id: "teacher-3",
            subjectCode: "MATH",
            availability,
            salaryMinor: 3_000_000,
          },
        ],
      },
    ],
    program: [{ subjectCode: "MATH", sessionsPerWeek: 1, durationMinutes: 30 }],
    fixedStaff: [],
    financial: {
      ages: [
        { code: "AGE_3", age: 3, demand: children, tariffMinor: 1_500_000 },
      ],
      discountMix: [{ basisPoints: 0, shareBasisPoints: 10_000 }],
      rentMinor: 5_000_000,
      otherCosts: [],
      foodCostMinor: 0,
    },
  };
}

function exhaustiveFinancialOracle(input) {
  const revenueMinor =
    input.groupRanges[0].children * input.financial.ages[0].tariffMinor;
  const candidates = [];
  for (
    let groups = input.groupRanges[0].minGroups;
    groups <= input.groupRanges[0].maxGroups;
    groups += 1
  ) {
    const base = Math.floor(input.groupRanges[0].children / groups);
    const extra = input.groupRanges[0].children % groups;
    const sizes = Array.from(
      { length: groups },
      (_, index) => base + (index < extra ? 1 : 0),
    );
    if (sizes.some((size) => size > 20)) continue;
    const pairPayrollMinor = sizes.reduce(
      (sum, size) => sum + 6_000_000 + 800_000 * Math.max(0, size - 12),
      0,
    );
    for (const variant of input.teacherVariants) {
      const teacherPayrollMinor = variant.teachers.reduce(
        (sum, teacher) => sum + teacher.salaryMinor,
        0,
      );
      candidates.push({
        groups,
        teacherVariantId: variant.id,
        payrollMinor: pairPayrollMinor + teacherPayrollMinor,
        resultMinor:
          revenueMinor -
          pairPayrollMinor -
          teacherPayrollMinor -
          input.financial.rentMinor,
      });
    }
  }
  return candidates.sort(
    (left, right) =>
      right.resultMinor - left.resultMinor ||
      left.groups - right.groups ||
      left.teacherVariantId.localeCompare(right.teacherVariantId),
  )[0];
}

test("search confirms schedules and uses stable tie-breaks without dropping demand", async () => {
  const result = await searchConfigurations(scenario());
  assert.equal(result.bestFound.groups, 1);
  assert.equal(result.bestFound.teacherVariantId, "variant-a");
  assert.equal(result.minimumGroupsNonnegative.groups, 1);
  assert.equal(
    result.bestFound.childrenByGroup["scenario-age-AGE_3-group-01"],
    2,
  );
  assert.equal(
    result.confirmed.every((candidate) => candidate.scheduleComplete),
    true,
  );
  assert.ok(
    result.rejected.some(
      (candidate) => candidate.reason === "INSUFFICIENT_ROOM_CAPACITY",
    ),
  );
});

test("shared candidate budget yields partial results and never claims impossibility", async () => {
  let yields = 0;
  const result = await searchConfigurations(scenario(), {
    budget: { candidates: 1, milliseconds: 5000 },
    yieldToEventLoop: async () => {
      yields += 1;
    },
  });
  assert.equal(result.budget.candidatesChecked, 1);
  assert.equal(result.budget.exhausted, true);
  assert.match(result.explanation, /no impossibility conclusion/);
  assert.equal(yields, 1);
});

test("zero time budget checks no candidate", async () => {
  const result = await searchConfigurations(scenario(), {
    budget: { milliseconds: 0 },
  });
  assert.equal(result.budget.candidatesChecked, 0);
  assert.equal(result.budget.exhausted, true);
  assert.equal(result.bestFound, null);
});

test("configuration search service is ADMIN-only", async () => {
  const service = new ConfigurationSearchService({ authorizer });
  await assert.rejects(
    service.compare(scenario(), { id: "manager", roles: ["MANAGER"] }),
    { status: 403 },
  );
});

test("small exhaustive oracle agrees on fixed-demand optimum and teacher payroll", async () => {
  const input = fixedDemandScenario();
  const oracle = exhaustiveFinancialOracle(input);
  const result = await searchConfigurations(input);
  assert.equal(result.budget.exhausted, false);
  assert.equal(result.bestFound.groups, oracle.groups);
  assert.equal(result.bestFound.teacherVariantId, oracle.teacherVariantId);
  assert.equal(result.bestFound.payrollMinor, oracle.payrollMinor);
  assert.equal(result.bestFound.resultMinor, oracle.resultMinor);
  assert.equal(result.bestFound.groups, 2);
  assert.equal(result.bestFound.payrollMinor, 16_000_000);
});

test("configuration search rejects demand requiring more than 20 children per group", async () => {
  const input = fixedDemandScenario(21);
  input.groupRanges[0].maxGroups = 1;
  const result = await searchConfigurations(input);
  assert.equal(result.bestFound, null);
  assert.equal(result.rejected.length, input.teacherVariants.length);
  assert.equal(
    result.rejected.every(
      (candidate) => candidate.reason === "GROUP_CAPACITY_EXCEEDED",
    ),
    true,
  );
});

test("API input requires unique resources, matched ages and a real Monday", () => {
  const input = scenario();
  assert.equal(configurationSearchSchema.safeParse(input).success, true);
  assert.equal(
    configurationSearchSchema.safeParse({ ...input, weekStart: "2026-11-03" })
      .success,
    false,
  );
  assert.equal(
    configurationSearchSchema.safeParse({
      ...input,
      rooms: [...input.rooms, input.rooms[0]],
    }).success,
    false,
  );
});
