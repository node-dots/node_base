import { spawnSync } from "node:child_process";
import { demoGroups } from "./demo-groups.js";
import { initialCatalogEntries } from "../src/modules/catalog/catalog.seed.js";
import { isSeedDatabaseAllowed } from "./seed-policy.js";

function docker(argumentsList, timeout = 60000) {
  const result = spawnSync("docker", argumentsList, {
    stdio: "inherit",
    timeout,
  });
  if (result.error || result.status !== 0) {
    throw new Error(
      "Не вдалося виконати Docker-команду. Перевірте Docker Desktop і повідомлення вище.",
    );
  }
}

try {
  const databaseName = process.env.SEED_DATABASE ?? "kindergarten_dev";
  if (!isSeedDatabaseAllowed(databaseName)) {
    throw new Error(
      "Не вдалося виконати Docker-команду. Перевірте Docker Desktop і повідомлення вище.",
    );
  }
  // Запускаємо тільки MongoDB; Jaeger для seed не потрібен.
  docker(
    ["compose", "up", "-d", "--wait", "--wait-timeout", "60", "mongodb"],
    180000,
  );
  docker([
    "compose",
    "exec",
    "-T",
    "mongodb",
    "mongosh",
    "--quiet",
    "/scripts/mongodb-init.js",
  ]);

  const script = `
    const database = db.getSiblingDB(${JSON.stringify(databaseName)});
    const groups = ${JSON.stringify(demoGroups)};
    const catalogEntries = ${JSON.stringify(initialCatalogEntries)};
    let inserted = 0;
    for (const group of groups) {
      const { _id, ...fields } = group;
      const result = database.groups.updateOne(
        { _id: ObjectId(_id) },
        { $setOnInsert: fields },
        { upsert: true }
      );
      inserted += result.upsertedCount;
    }
    let catalogInserted = 0;
    for (const entry of catalogEntries) {
      const { _id, ...fields } = entry;
      const result = database.catalog.updateOne(
        { _id: ObjectId(_id) },
        { $setOnInsert: fields },
        { upsert: true }
      );
      catalogInserted += result.upsertedCount;
    }
    print(JSON.stringify({
      database: database.getName(),
      groups: { inserted, existing: groups.length - inserted, total: database.groups.countDocuments() },
      catalog: { inserted: catalogInserted, existing: catalogEntries.length - catalogInserted, total: database.catalog.countDocuments() }
    }));
  `;
  // Аргументи передаємо без shell; дані вставляємо як JSON, а не як команди оболонки.
  docker([
    "compose",
    "exec",
    "-T",
    "mongodb",
    "mongosh",
    "--quiet",
    "--eval",
    script,
  ]);
  const { seedDemoScenario } = await import("./demo-scenario.js");
  await seedDemoScenario({ databaseName });
  console.log(
    `Seed завершено. Наявні записи збережено. База: ${databaseName}; сценарій охоплює групи, каталог, людей, дітей, фінанси та розклад.`,
  );
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
