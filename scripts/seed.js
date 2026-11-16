import { spawnSync } from "node:child_process";
import mongoose from "mongoose";
import { demoGroups } from "./demo-groups.js";
import { seedCatalog } from "../src/modules/catalog/catalog.seed.js";
import { CatalogModel } from "../src/modules/catalog/catalog.model.js";
import { GroupModel } from "../src/modules/groups/group.model.js";
import { withHistoryContext } from "../src/modules/history/history.context.js";
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

  await mongoose.connect(
    `mongodb://127.0.0.1:27017/${databaseName}?replicaSet=rs0&directConnection=true`,
    { serverSelectionTimeoutMS: 5000 },
  );
  try {
    const session = await mongoose.connection.startSession();
    let summary;
    try {
      summary = await withHistoryContext(
        {
          requestId: "seed:base-data",
          source: "SEED",
          reason: "Provision idempotent base groups and catalog entries",
        },
        () =>
          session.withTransaction(async () => {
            let inserted = 0;
            for (const { _id, ...fields } of demoGroups) {
              const result = await GroupModel.updateOne(
                { _id },
                { $setOnInsert: fields },
                { upsert: true, session },
              );
              inserted += result.upsertedCount;
            }
            const catalog = await seedCatalog(CatalogModel, { session });
            return {
              database: databaseName,
              groups: {
                inserted,
                existing: demoGroups.length - inserted,
                total: await GroupModel.countDocuments().session(session),
              },
              catalog: {
                ...catalog,
                total: await CatalogModel.countDocuments().session(session),
              },
            };
          }),
      );
    } finally {
      await session.endSession();
    }
    console.log(JSON.stringify(summary));
    const { seedDemoScenario } = await import("./demo-scenario.js");
    await seedDemoScenario({ databaseName });
  } finally {
    await mongoose.disconnect();
  }
  console.log(
    `Seed завершено. Наявні записи збережено. База: ${databaseName}; сценарій охоплює групи, каталог, людей, дітей, фінанси та розклад.`,
  );
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
