import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import mongoose from "mongoose";
import {
  readDatabaseConfig,
  connectMongo,
  disconnectMongo,
} from "../src/config/database.js";
import { GroupModel } from "../src/modules/groups/group.model.js";
import { CatalogModel } from "../src/modules/catalog/catalog.model.js";
import { CATALOG_KIND } from "../src/modules/catalog/catalog.constants.js";
import { demoGroups } from "./demo-groups.js";

export function planGroupMigration(groups, categories, schoolYear) {
  if (!/^\d{4}-\d{4}$/.test(schoolYear))
    throw new TypeError("schoolYear must use YYYY-YYYY");
  const [start, end] = schoolYear.split("-").map(Number);
  if (end !== start + 1)
    throw new TypeError("schoolYear must contain consecutive years");
  const byAge = new Map(
    categories
      .filter((entry) => entry.active)
      .map((entry) => [entry.age, entry]),
  );
  const updates = [];
  const blockers = [];
  for (const group of groups) {
    const category = group.ageCategoryId
      ? undefined
      : byAge.get(group.ageCategory);
    if (!group.ageCategoryId && !category) {
      blockers.push({
        id: String(group._id),
        reason: "No active age category matches legacy ageCategory",
      });
      continue;
    }
    updates.push({
      id: String(group._id),
      set: {
        ...(!group.ageCategoryId ? { ageCategoryId: category._id } : {}),
        ...(!group.schoolYear ? { schoolYear } : {}),
      },
      preservedFields: [
        "name",
        "ageCategory",
        "capacity",
        "status",
        "manual assignments",
      ],
    });
  }
  return { updates, blockers };
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const apply = args.has("--apply");
  const yearFlag = process.argv.indexOf("--school-year");
  const schoolYear = yearFlag >= 0 ? process.argv[yearFlag + 1] : undefined;
  if (!schoolYear)
    throw new Error(
      "Pass --school-year YYYY-YYYY; use --apply only after reviewing the dry-run report.",
    );
  const { MONGO_URI } = readDatabaseConfig();
  await connectMongo(MONGO_URI);
  try {
    if (
      !["kindergarten_dev", "kindergarten_seed_test"].includes(
        mongoose.connection.name,
      )
    ) {
      throw new Error(
        "Group migration is limited to kindergarten_dev and kindergarten_seed_test",
      );
    }
    const demoIds = demoGroups.map(({ _id }) => _id);
    const [groups, categories] = await Promise.all([
      GroupModel.find({ _id: { $in: demoIds } }).lean(),
      CatalogModel.find({ kind: CATALOG_KIND.AGE_CATEGORY }).lean(),
    ]);
    const plan = planGroupMigration(groups, categories, schoolYear);
    console.log(
      JSON.stringify(
        {
          mode: apply ? "APPLY" : "DRY_RUN",
          schoolYear,
          matched: groups.length,
          ...plan,
        },
        null,
        2,
      ),
    );
    if (plan.blockers.length || !apply) return;
    for (const item of plan.updates) {
      await GroupModel.updateOne(
        { _id: item.id },
        { $set: item.set },
        { runValidators: true },
      );
    }
    console.log(
      "Migration completed. Existing group fields and assignments were preserved.",
    );
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
