import { generateScheduleDraft } from "../schedules/schedule.generator.js";
import { calculateFinancialForecast } from "./scenario.calculations.js";

const DEFAULT_BUDGET = Object.freeze({
  candidates: 1000,
  milliseconds: 5000,
  yieldEvery: 1,
});
const stable = (left, right) => left.localeCompare(right);

function candidateCounts(
  ranges,
  totalGroups,
  index = 0,
  selected = [],
  output = [],
) {
  if (index === ranges.length) {
    if (selected.reduce((sum, value) => sum + value, 0) === totalGroups)
      output.push([...selected]);
    return output;
  }
  const range = ranges[index];
  for (let count = range.minGroups; count <= range.maxGroups; count += 1) {
    const next = [...selected, count];
    const sum = next.reduce((a, b) => a + b, 0);
    const remainingMin = ranges
      .slice(index + 1)
      .reduce((n, item) => n + item.minGroups, 0);
    const remainingMax = ranges
      .slice(index + 1)
      .reduce((n, item) => n + item.maxGroups, 0);
    if (sum + remainingMin <= totalGroups && sum + remainingMax >= totalGroups)
      candidateCounts(ranges, totalGroups, index + 1, next, output);
  }
  return output;
}

function enumerateCandidates(input) {
  const ranges = [...input.groupRanges].sort(
    (a, b) => a.age - b.age || stable(a.ageCode, b.ageCode),
  );
  const variants = [...input.teacherVariants].sort(
    (a, b) => a.teachers.length - b.teachers.length || stable(a.id, b.id),
  );
  const minTotal = Math.max(
    1,
    ranges.reduce((sum, range) => sum + range.minGroups, 0),
  );
  const maxTotal = Math.min(
    15,
    ranges.reduce((sum, range) => sum + range.maxGroups, 0),
  );
  const candidates = [];
  for (let totalGroups = minTotal; totalGroups <= maxTotal; totalGroups += 1) {
    for (const counts of candidateCounts(ranges, totalGroups)) {
      for (const variant of variants) {
        candidates.push({ totalGroups, ranges, counts, variant });
      }
    }
  }
  return candidates;
}

function buildResources(input, candidate) {
  const groups = [];
  for (const [index, range] of candidate.ranges.entries()) {
    const count = candidate.counts[index];
    if (range.children > 0 && count === 0)
      return {
        reason: "NO_GROUPS_FOR_AGE_DEMAND",
        details: { ageCode: range.ageCode, children: range.children },
      };
    const capacity = Math.max(
      1,
      Math.ceil(range.children / Math.max(1, count)),
    );
    for (let i = 0; i < count; i += 1)
      groups.push({
        id: `scenario-age-${range.ageCode}-group-${String(i + 1).padStart(2, "0")}`,
        age: range.age,
        ageCode: range.ageCode,
        status: "ACTIVE",
        schoolYear: input.schoolYear,
        capacity,
      });
  }
  const rooms = [...input.rooms]
    .filter((room) => room.active && room.roomType === "GROUP")
    .sort((a, b) => a.capacity - b.capacity || stable(a.id, b.id));
  const orderedGroups = [...groups].sort(
    (a, b) => b.capacity - a.capacity || stable(a.id, b.id),
  );
  for (const group of orderedGroups) {
    const roomIndex = rooms.findIndex(
      (room) => room.capacity >= group.capacity,
    );
    if (roomIndex < 0)
      return {
        reason: "INSUFFICIENT_ROOM_CAPACITY",
        details: { groupId: group.id, requiredCapacity: group.capacity },
      };
    group.roomId = rooms.splice(roomIndex, 1)[0].id;
  }
  const childrenByGroup = new Map();
  for (const range of candidate.ranges) {
    const ageGroups = groups
      .filter((group) => group.ageCode === range.ageCode)
      .sort((a, b) => stable(a.id, b.id));
    const base = Math.floor(range.children / ageGroups.length);
    const extra = range.children % ageGroups.length;
    for (const [index, group] of ageGroups.entries())
      childrenByGroup.set(group.id, base + (index < extra ? 1 : 0));
  }
  const staff = [];
  for (const [index, group] of groups.entries()) {
    staff.push({
      groupId: group.id,
      positionCode: "EDUCATOR",
      salaryMinor: 0,
      scenarioId: `educator-${String(index + 1).padStart(2, "0")}`,
    });
    staff.push({
      groupId: group.id,
      positionCode: "ASSISTANT",
      salaryMinor: 0,
      scenarioId: `assistant-${String(index + 1).padStart(2, "0")}`,
    });
  }
  for (const member of input.fixedStaff) {
    const group = groups[0];
    if (group)
      staff.push({
        groupId: group.id,
        positionCode: "FIXED_STAFF",
        salaryMinor: member.salaryMinor,
        scenarioId: member.id,
      });
  }
  return {
    groups,
    childrenByGroup,
    staff,
    rooms: input.rooms,
    teachers: candidate.variant.teachers.map((teacher) => ({
      ...teacher,
      status: "ACTIVE",
      positionCode: "TEACHER",
    })),
  };
}

function financeFor(input, resources) {
  const demandByCode = Object.fromEntries(
    input.groupRanges.map((range) => [range.ageCode, range.children]),
  );
  const scenario = {
    ...input.financial,
    groups: resources.groups.map((group) => ({
      id: group.id,
      age: group.age,
      capacity: group.capacity,
    })),
    staff: resources.staff.map(({ groupId, positionCode, salaryMinor }) => ({
      groupId,
      positionCode,
      salaryMinor,
    })),
  };
  return calculateFinancialForecast(scenario, { demandByCode });
}

function rank(a, b) {
  return (
    b.financialBasisMinor - a.financialBasisMinor ||
    a.groups - b.groups ||
    a.teachers - b.teachers ||
    stable(a.groupKey, b.groupKey) ||
    stable(a.teacherVariantId, b.teacherVariantId)
  );
}

/** Bounded candidate search; every nested scheduler shares the same absolute deadline. */
export async function searchConfigurations(
  input,
  {
    budget: limits = {},
    now = Date.now,
    yieldToEventLoop = () => new Promise((resolve) => setImmediate(resolve)),
  } = {},
) {
  const budget = { ...DEFAULT_BUDGET, ...limits };
  const startedAt = now();
  const deadline = startedAt + budget.milliseconds;
  const candidateSpace = enumerateCandidates(input);
  const confirmed = [];
  const unconfirmed = [];
  const rejected = [];
  let bestFound = null;
  let minimumGroupsNonnegative = null;
  let checked = 0;
  let exhausted = false;
  for (const candidate of candidateSpace) {
    if (checked >= budget.candidates || now() >= deadline) {
      exhausted = true;
      break;
    }
    checked += 1;
    const resources = buildResources(input, candidate);
    if (resources.reason) {
      rejected.push({
        groups: candidate.totalGroups,
        teacherVariantId: candidate.variant.id,
        reason: resources.reason,
        details: resources.details,
      });
    } else {
      try {
        const financial = financeFor(input, resources);
        const timeLeft = Math.max(0, deadline - now());
        const schedule = await generateScheduleDraft({
          weekStart: input.weekStart,
          snapshot: {
            schoolYear: input.schoolYear,
            groups: resources.groups.map(({ ageCode, ...group }) => group),
            rooms: resources.rooms,
            teachers: resources.teachers,
            program: input.program,
          },
          limits: {
            groups: 15,
            slots: 2000,
            checks: 100_000,
            milliseconds: Math.min(2000, timeLeft),
            batchSize: 250,
          },
          now,
          yieldToEventLoop,
        });
        const result = {
          groups: candidate.totalGroups,
          teachers: candidate.variant.teachers.length,
          teacherVariantId: candidate.variant.id,
          groupKey: candidate.counts.join(","),
          resultMinor: financial.resultMinor,
          resultBeforeFoodMinor: financial.resultBeforeFoodMinor,
          financialComplete: financial.complete,
          childrenByGroup: Object.fromEntries(resources.childrenByGroup),
          schedule: {
            slots: schedule.slots,
            complete: schedule.complete,
            unscheduled: schedule.unscheduled,
            budget: schedule.budget,
          },
          validation: schedule.validation,
          assumptions: financial.assumptions,
        };
        result.financialBasisMinor =
          financial.resultMinor ?? financial.resultBeforeFoodMinor;
        if (schedule.complete && schedule.validation.valid) {
          const summary = {
            groups: result.groups,
            teachers: result.teachers,
            teacherVariantId: result.teacherVariantId,
            groupKey: result.groupKey,
            resultMinor: result.resultMinor,
            resultBeforeFoodMinor: result.resultBeforeFoodMinor,
            financialComplete: result.financialComplete,
            childrenByGroup: result.childrenByGroup,
            scheduleComplete: true,
            scheduledSlots: schedule.slots.length,
          };
          confirmed.push(summary);
          if (!bestFound || rank(result, bestFound) < 0) bestFound = result;
          if (
            financial.complete &&
            financial.resultMinor >= 0 &&
            (!minimumGroupsNonnegative ||
              result.groups < minimumGroupsNonnegative.groups ||
              (result.groups === minimumGroupsNonnegative.groups &&
                (result.teachers < minimumGroupsNonnegative.teachers ||
                  (result.teachers === minimumGroupsNonnegative.teachers &&
                    (stable(
                      result.groupKey,
                      minimumGroupsNonnegative.groupKey,
                    ) < 0 ||
                      (result.groupKey === minimumGroupsNonnegative.groupKey &&
                        stable(
                          result.teacherVariantId,
                          minimumGroupsNonnegative.teacherVariantId,
                        ) < 0))))))
          )
            minimumGroupsNonnegative = result;
        } else
          unconfirmed.push({
            groups: result.groups,
            teachers: result.teachers,
            teacherVariantId: result.teacherVariantId,
            groupKey: result.groupKey,
            resultMinor: result.resultMinor,
            resultBeforeFoodMinor: result.resultBeforeFoodMinor,
            financialComplete: result.financialComplete,
            unscheduled: {
              count: schedule.unscheduled.length,
              reasons: Object.fromEntries(
                schedule.unscheduled.reduce((counts, item) => {
                  counts.set(item.reason, (counts.get(item.reason) ?? 0) + 1);
                  return counts;
                }, new Map()),
              ),
              examples: schedule.unscheduled.slice(0, 10),
            },
            reason: "SCHEDULE_NOT_CONFIRMED",
          });
      } catch (error) {
        rejected.push({
          groups: candidate.totalGroups,
          teacherVariantId: candidate.variant.id,
          reason: "INVALID_SCENARIO",
          message: error.message,
        });
      }
    }
    if (checked % budget.yieldEvery === 0) await yieldToEventLoop();
  }
  if (
    checked < candidateSpace.length &&
    (checked >= budget.candidates || now() >= deadline)
  )
    exhausted = true;
  return {
    bestFound,
    minimumGroupsNonnegative,
    confirmed,
    unconfirmed,
    rejected,
    budget: {
      candidatesChecked: checked,
      candidateLimit: budget.candidates,
      elapsedMilliseconds: Math.max(0, now() - startedAt),
      timeLimitMilliseconds: budget.milliseconds,
      exhausted,
    },
    bounds: {
      maxGroups: 15,
      maxCandidates: budget.candidates,
      heuristic: true,
      globalOptimalityGuaranteed: false,
    },
    ...(exhausted
      ? {
          explanation:
            "Search budget ended; no impossibility conclusion is made.",
        }
      : confirmed.length === 0
        ? {
            explanation:
              "No fully validated schedule was found among checked candidates; heuristic search does not prove impossibility.",
          }
        : {}),
  };
}
