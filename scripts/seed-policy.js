const FIXED_SEED_DATABASES = new Set([
  "kindergarten_dev",
  "kindergarten_seed_test",
]);

export function isSeedDatabaseAllowed(databaseName) {
  return (
    FIXED_SEED_DATABASES.has(databaseName) ||
    /^kindergarten_test_[a-f\d]{32}$/i.test(databaseName ?? "")
  );
}
