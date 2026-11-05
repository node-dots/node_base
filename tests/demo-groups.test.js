import test from "node:test";
import assert from "node:assert/strict";
import { demoGroups } from "../scripts/demo-groups.js";

test("demo groups have stable unique IDs and valid non-destructive seed fields", () => {
  assert.equal(demoGroups.length, 8);
  assert.equal(
    new Set(demoGroups.map(({ _id }) => _id)).size,
    demoGroups.length,
  );
  assert.ok(demoGroups.every(({ _id }) => /^[a-f\d]{24}$/.test(_id)));
  assert.ok(
    demoGroups.every(
      ({ name, ageCategory, capacity, status }) =>
        typeof name === "string" &&
        ageCategory >= 2 &&
        ageCategory <= 5 &&
        Number.isInteger(capacity) &&
        capacity > 0 &&
        status === "DRAFT",
    ),
  );
});
