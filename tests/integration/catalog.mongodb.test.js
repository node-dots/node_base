import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import mongoose from "mongoose";
import { CatalogModel } from "../../src/modules/catalog/catalog.model.js";
import { CatalogRepository } from "../../src/modules/catalog/catalog.repository.js";
import {
  CATALOG_KIND,
  ROOM_TYPE,
} from "../../src/modules/catalog/catalog.constants.js";
import {
  initialCatalogEntries,
  seedCatalog,
} from "../../src/modules/catalog/catalog.seed.js";

test(
  "MongoDB: catalog round-trip, унікальність, деактивація та ідемпотентний seed",
  { skip: process.env.RUN_MONGO_TESTS !== "true" },
  async () => {
    const databaseName = `kindergarten_catalog_${randomUUID().replaceAll("-", "")}`;
    const connection = await mongoose
      .createConnection(
        "mongodb://127.0.0.1:27017/?replicaSet=rs0&directConnection=true",
        { dbName: databaseName, serverSelectionTimeoutMS: 5000 },
      )
      .asPromise();

    try {
      const model = connection.model("Catalog", CatalogModel.schema);
      await model.init();
      const repository = new CatalogRepository({ catalogModel: model });

      assert.deepEqual(await seedCatalog(model), { inserted: 46, existing: 0 });
      assert.equal(await model.countDocuments(), 46);

      const stableEntry = initialCatalogEntries[0];
      await model.updateOne(
        { _id: stableEntry._id },
        { $set: { name: "Ручна назва" } },
      );
      assert.deepEqual(await seedCatalog(model), { inserted: 0, existing: 46 });
      assert.equal(
        (await model.findById(stableEntry._id).lean()).name,
        "Ручна назва",
      );

      const room = await repository.findActiveByCode(
        CATALOG_KIND.ROOM,
        "GROUP_ROOM_01",
      );
      assert.equal(room.id, "200000000000000000000001");
      assert.equal(room.roomType, ROOM_TYPE.GROUP);
      assert.equal(room.capacity, 20);
      assert.deepEqual(await repository.findById(room.id), room);

      const deactivated = await repository.deactivateById(room.id);
      assert.equal(deactivated.active, false);
      assert.equal(
        await repository.findActiveByCode(CATALOG_KIND.ROOM, room.code),
        null,
      );
      assert.equal(typeof repository.deleteById, "undefined");

      await assert.rejects(
        repository.insert({
          kind: CATALOG_KIND.ROOM,
          code: "GROUP_ROOM_02",
          name: "Дублікат коду",
          active: true,
          roomType: ROOM_TYPE.GROUP,
          capacity: 10,
        }),
        (error) => error?.code === 11000,
      );

      await assert.rejects(
        repository.insert({
          kind: CATALOG_KIND.POSITION,
          code: "INVALID_FIELDS",
          name: "Некоректна посада",
          active: true,
          capacity: 10,
        }),
        /Catalog fields do not match kind/,
      );
    } finally {
      try {
        await connection.dropDatabase();
      } finally {
        await connection.close();
      }
    }
  },
);
