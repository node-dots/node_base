import test from "node:test";
import assert from "node:assert/strict";
import { CATALOG_KIND } from "../src/modules/catalog/catalog.constants.js";
import { catalogEntrySchema } from "../src/modules/catalog/catalog.schema.js";
import { authorizer } from "../src/modules/people/access/authorizer.js";
import { ChildBenefitService } from "../src/modules/children/childBenefit.service.js";
import { FinancialCatalogService } from "../src/modules/catalog/financialCatalog.service.js";
import {
  createBenefitAssignment,
  firstDayOfNextMonth,
  latestValidVersion,
  validateFinancialVersion,
} from "../src/modules/catalog/financialRules.js";

test("financial catalog schemas preserve money in cents and discount in basis points", () => {
  assert.equal(
    catalogEntrySchema.safeParse({
      kind: CATALOG_KIND.TUITION_RATE,
      code: "TUITION",
      name: "Tuition",
      effectiveFrom: "2026-11-01",
      amountCents: 1_500_000,
    }).success,
    true,
  );
  assert.equal(
    catalogEntrySchema.safeParse({
      kind: CATALOG_KIND.MEAL_RATE,
      code: "MEAL_2",
      name: "Meal",
      effectiveFrom: "2026-11-01",
      ageCategoryCode: "AGE_2",
      amountCents: 30_000,
    }).success,
    true,
  );
  assert.equal(
    catalogEntrySchema.safeParse({
      kind: CATALOG_KIND.BENEFIT,
      code: "BENEFIT_10",
      name: "10%",
      effectiveFrom: "2026-11-01",
      basisPoints: 1_000,
    }).success,
    true,
  );
  assert.equal(
    catalogEntrySchema.safeParse({
      kind: CATALOG_KIND.BENEFIT,
      code: "BAD",
      name: "Bad",
      effectiveFrom: "2026-11-01",
      basisPoints: 10_001,
    }).success,
    false,
  );
});

test("financial versions can start no earlier than next month and on month boundaries", () => {
  assert.equal(firstDayOfNextMonth("2026-12-20"), "2027-01-01");
  assert.equal(
    validateFinancialVersion({
      effectiveFrom: "2027-01-01",
      today: "2026-12-20",
    }),
    "2027-01-01",
  );
  assert.throws(
    () =>
      validateFinancialVersion({
        effectiveFrom: "2026-12-01",
        today: "2026-12-20",
      }),
    { code: "RETROACTIVE_FINANCIAL_CHANGE" },
  );
  assert.throws(
    () =>
      validateFinancialVersion({
        effectiveFrom: "2027-01-02",
        today: "2026-12-20",
      }),
    { code: "INVALID_EFFECTIVE_DATE" },
  );
});

test("latest-valid lookup selects the dated rule and fails explicitly when missing", () => {
  const versions = [
    {
      code: "TUITION",
      kind: "TUITION_RATE",
      active: true,
      effectiveFrom: "2026-01-01",
      amountCents: 1_500_000,
    },
    {
      code: "TUITION",
      kind: "TUITION_RATE",
      active: true,
      effectiveFrom: "2027-01-01",
      amountCents: 1_600_000,
    },
  ];
  assert.equal(
    latestValidVersion(versions, "2026-10-01").amountCents,
    1_500_000,
  );
  assert.throws(() => latestValidVersion([], "2026-10-01"), {
    code: "FINANCIAL_VERSION_NOT_FOUND",
  });
});

test("benefit assignment snapshots the rate and rejects overlaps or history overflow", () => {
  const benefit = {
    kind: "BENEFIT",
    code: "BENEFIT_20",
    active: true,
    basisPoints: 2_000,
  };
  const assignment = createBenefitAssignment({
    benefit,
    startMonth: "2027-01",
    endMonth: "2027-03",
    today: "2026-12-20",
  });
  assert.deepEqual(assignment, {
    benefitCode: "BENEFIT_20",
    basisPoints: 2_000,
    startMonth: "2027-01",
    endMonth: "2027-03",
  });
  assert.throws(
    () =>
      createBenefitAssignment({
        benefit,
        startMonth: "2027-03",
        today: "2026-12-20",
        existing: [assignment],
      }),
    { code: "BENEFIT_PERIOD_OVERLAP" },
  );
  assert.throws(
    () =>
      createBenefitAssignment({
        benefit,
        startMonth: "2026-12",
        today: "2026-12-20",
      }),
    { code: "RETROACTIVE_BENEFIT" },
  );
  assert.throws(
    () =>
      createBenefitAssignment({
        benefit,
        startMonth: "2027-04",
        today: "2026-12-20",
        existing: Array.from({ length: 100 }, (_, index) => ({
          startMonth: `2027-${String(index + 1).padStart(2, "0")}`,
        })),
      }),
    { code: "BENEFIT_HISTORY_LIMIT" },
  );
});

test("MANAGER assigns a dated benefit snapshot but cannot create financial versions", async () => {
  const child = { id: "000000000000000000000001", benefitAssignments: [] };
  const audits = [];
  const childRepository = {
    async findByIdForUpdate() {
      return structuredClone(child);
    },
    async updateBenefitAssignmentsById(_id, assignments) {
      child.benefitAssignments = assignments;
      return structuredClone(child);
    },
  };
  const service = new ChildBenefitService({
    childRepository,
    catalogRepository: {
      async findLatestValid() {
        return {
          kind: "BENEFIT",
          code: "BENEFIT_20",
          active: true,
          basisPoints: 2_000,
        };
      },
    },
    authorizer,
    unitOfWork: {
      async execute(operation) {
        return operation({
          session: {},
          async recordAudit(event) {
            audits.push(event);
          },
        });
      },
    },
    clock: { now: () => new Date("2026-12-20T10:00:00.000Z") },
  });
  const manager = { id: "000000000000000000000002", roles: ["MANAGER"] };
  await service.assign(
    child.id,
    { benefitCode: "BENEFIT_20", startMonth: "2027-01", endMonth: "2027-02" },
    manager,
    "request-1",
  );
  assert.equal(child.benefitAssignments[0].basisPoints, 2_000);
  assert.equal(audits[0].after.basisPoints, 2_000);
  const financialCatalog = new FinancialCatalogService({
    catalogRepository: {},
    authorizer,
    unitOfWork: {},
  });
  await assert.rejects(
    financialCatalog.createVersion(
      { kind: "TUITION_RATE" },
      manager,
      "request-2",
    ),
    { code: "FORBIDDEN" },
  );
});
