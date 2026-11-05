import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import mongoose from "mongoose";
import {
  connectMongo,
  disconnectMongo,
  readDatabaseConfig,
} from "../src/config/database.js";
import { CatalogModel } from "../src/modules/catalog/catalog.model.js";

async function main() {
  const apply = process.argv.includes("--apply");
  await connectMongo(readDatabaseConfig().MONGO_URI);
  try {
    if (
      !["kindergarten_dev", "kindergarten_seed_test"].includes(
        mongoose.connection.name,
      )
    ) {
      throw new Error(
        "Catalog index migration is limited to kindergarten_dev and kindergarten_seed_test",
      );
    }
    const collection = mongoose.connection.collection("catalog");
    const indexes = await collection.indexes();
    const oldIndex = indexes.find(
      ({ name }) => name === "catalog_kind_code_unique",
    );
    const nextIndex = indexes.find(
      ({ name }) => name === "catalog_kind_code_effective_unique",
    );
    console.log(
      JSON.stringify(
        {
          mode: apply ? "APPLY" : "DRY_RUN",
          database: mongoose.connection.name,
          dropIndex: oldIndex?.name ?? null,
          createIndex: nextIndex ? null : "catalog_kind_code_effective_unique",
        },
        null,
        2,
      ),
    );
    if (!apply) return;
    if (!nextIndex)
      await collection.createIndex(
        { kind: 1, code: 1, effectiveFrom: 1 },
        { unique: true, name: "catalog_kind_code_effective_unique" },
      );
    if (oldIndex) await collection.dropIndex(oldIndex.name);
  } finally {
    await disconnectMongo();
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
