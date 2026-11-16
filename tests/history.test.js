import test from "node:test";
import assert from "node:assert/strict";
import {
  collectChangedFields,
  REDACTED_VALUE,
  sanitizeHistorySnapshot,
} from "../src/modules/history/history.snapshot.js";

test("history snapshot preserves business state and recursively redacts secrets", () => {
  const snapshot = sanitizeHistorySnapshot({
    _id: "0123456789abcdef01234567",
    name: "Group A",
    nested: { tokenVersion: 4, accessToken: "jwt", value: 10 },
    account: { email: "admin@example.test", passwordHash: "bcrypt" },
    array: [{ apiKey: "secret", amountMinor: 500 }],
  });
  assert.equal(snapshot.name, "Group A");
  assert.equal(snapshot.nested.tokenVersion, REDACTED_VALUE);
  assert.equal(snapshot.nested.accessToken, REDACTED_VALUE);
  assert.equal(snapshot.account.passwordHash, REDACTED_VALUE);
  assert.equal(snapshot.account.email, "admin@example.test");
  assert.equal(snapshot.array[0].apiKey, REDACTED_VALUE);
  assert.equal(snapshot.array[0].amountMinor, 500);
});

test("history diff reports scalar, nested and array changes deterministically", () => {
  assert.deepEqual(
    collectChangedFields(
      { capacity: 10, employee: { status: "ACTIVE" }, roles: ["PARENT"] },
      {
        capacity: 12,
        employee: { status: "ON_LEAVE" },
        roles: ["PARENT", "EDUCATOR"],
      },
    ),
    ["capacity", "employee.status", "roles"],
  );
});
