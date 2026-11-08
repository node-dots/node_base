import test from "node:test";
import assert from "node:assert/strict";
import { planGroupMigration } from "../scripts/migrate-groups.js";

test("group migration plans additive catalog links and school year without overwriting legacy fields", () => {
  const groups = [
    {
      _id: "g1",
      name: "Manual edit",
      ageCategory: 3,
      capacity: 18,
      status: "DRAFT",
    },
  ];
  const categories = [{ _id: "c3", age: 3, active: true }];
  const plan = planGroupMigration(groups, categories, "2026-2027");
  assert.deepEqual(plan.blockers, []);
  assert.deepEqual(plan.updates[0].set, {
    ageCategoryId: "c3",
    schoolYear: "2026-2027",
  });
  assert.deepEqual(groups[0], {
    _id: "g1",
    name: "Manual edit",
    ageCategory: 3,
    capacity: 18,
    status: "DRAFT",
  });
  assert.throws(
    () => planGroupMigration(groups, categories, "2026-2028"),
    /consecutive/,
  );
});

test("migration reports missing age category mapping instead of guessing", () => {
  const plan = planGroupMigration(
    [{ _id: "g2", ageCategory: 4 }],
    [],
    "2026-2027",
  );
  assert.equal(plan.updates.length, 0);
  assert.equal(
    plan.blockers[0].reason,
    "No active age category matches legacy ageCategory",
  );
});
