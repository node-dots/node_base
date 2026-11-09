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
