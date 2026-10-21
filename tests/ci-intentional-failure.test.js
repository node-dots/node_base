import test from "node:test";
import assert from "node:assert/strict";

test("навмисна перевірка блокування CI", () => {
  assert.fail("TASK-002: контрольований червоний check");
});
