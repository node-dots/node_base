import { spawnSync } from "node:child_process";
import { demoGroups } from "./demo-groups.js";

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
  if (!["kindergarten_dev", "kindergarten_seed_test"].includes(databaseName)) {
    throw new Error(
      "Seed дозволений тільки для kindergarten_dev або kindergarten_seed_test",
    );
  }
  // Запускаємо тільки БД; Jaeger не потрібний для seed.
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
    print(JSON.stringify({ database: database.getName(), inserted, existing: groups.length - inserted, total: database.groups.countDocuments() }));
  `;
  // Аргументи передаємо без shell; дані вставляємо як JSON, а не команди оболонки.
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
  console.log(
    `Seed завершено. Наявні записи збережено. База: ${databaseName}; колекція: groups.`,
  );
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
