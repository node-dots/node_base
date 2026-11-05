import { spawnSync } from "node:child_process";

// Однаково працює в PowerShell і macOS: без shell-запису змінних оточення.
const result = spawnSync(
  process.execPath,
  [
    "--test",
    "tests/integration/children.mongodb.test.js",
    "tests/integration/groups.mongodb.test.js",
    "tests/integration/people.mongodb.test.js",
    "tests/integration/audit.mongodb.test.js",
    "tests/integration/auth.mongodb.test.js",
    "tests/integration/readiness.mongodb.test.js",
    "tests/integration/catalog.mongodb.test.js",
  ],
  {
    stdio: "inherit",
    env: { ...process.env, RUN_MONGO_TESTS: "true" },
  },
);
process.exitCode = result.status ?? 1;
