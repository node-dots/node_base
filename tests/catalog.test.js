import test from "node:test";
import assert from "node:assert/strict";
import { catalogEntrySchema } from "../src/modules/catalog/catalog.schema.js";
import {
  assertAvailableGroupRoom,
  assertCatalogEntryCanBePhysicallyDeleted,
} from "../src/modules/catalog/catalog.helpers.js";
import {
  CATALOG_KIND,
  CATALOG_LIMITS,
  ROOM_TYPE,
} from "../src/modules/catalog/catalog.constants.js";
import { initialCatalogEntries } from "../src/modules/catalog/catalog.seed.js";
import { CatalogModel } from "../src/modules/catalog/catalog.model.js";

test("кожний catalog kind приймає лише власні поля", () => {
  const examples = [
    { kind: CATALOG_KIND.AGE_CATEGORY, code: "AGE_2", name: "2 роки", age: 2 },
    {
      kind: CATALOG_KIND.ROOM,
      code: "ROOM_1",
      name: "Кімната",
      roomType: ROOM_TYPE.GROUP,
      capacity: 20,
    },
    { kind: CATALOG_KIND.POSITION, code: "EDUCATOR", name: "Вихователь" },
    { kind: CATALOG_KIND.SUBJECT, code: "MUSIC", name: "Музика" },
  ];

  for (const example of examples) {
    assert.equal(catalogEntrySchema.safeParse(example).success, true);
  }

  for (const invalid of [
    { kind: "UNKNOWN", code: "X", name: "X" },
    { kind: CATALOG_KIND.POSITION, code: "MANAGER", name: "Менеджер", age: 3 },
    {
      kind: CATALOG_KIND.SUBJECT,
      code: "MUSIC",
      name: "Music",
      unexpected: true,
    },
    {
      kind: CATALOG_KIND.ROOM,
      code: "SERVICE",
      name: "Службова",
      roomType: ROOM_TYPE.SERVICE,
      capacity: 2,
    },
    {
      kind: CATALOG_KIND.ROOM,
      code: "GROUP",
      name: "Групова",
      roomType: ROOM_TYPE.GROUP,
      capacity: CATALOG_LIMITS.MAX_GROUP_ROOM_CAPACITY + 1,
    },
  ]) {
    assert.equal(catalogEntrySchema.safeParse(invalid).success, false);
  }
});

test("внутрішній SETTINGS guard має revision і не доступний як публічний каталог", async () => {
  const guard = {
    kind: CATALOG_KIND.SETTINGS,
    code: "ACCOUNT_ADMIN_GUARD",
    name: "Account admin guard",
    active: true,
    revision: 0,
  };
  assert.equal(catalogEntrySchema.safeParse(guard).success, false);
  await assert.doesNotReject(new CatalogModel(guard).validate());
  await assert.rejects(
    new CatalogModel({ ...guard, revision: undefined }).validate(),
  );
  await assert.rejects(async () =>
    new CatalogModel({ ...guard, age: 2 }).validate(),
  );
});

test("службова або недоступна кімната не проходить перевірку групового ресурсу", () => {
  const groupRoom = {
    kind: CATALOG_KIND.ROOM,
    roomType: ROOM_TYPE.GROUP,
    capacity: 20,
    active: true,
  };
  assert.equal(assertAvailableGroupRoom(groupRoom), groupRoom);
  assert.throws(
    () =>
      assertAvailableGroupRoom({ ...groupRoom, roomType: ROOM_TYPE.SERVICE }),
    RangeError,
  );
  assert.throws(
    () => assertAvailableGroupRoom({ ...groupRoom, active: false }),
    RangeError,
  );
});

test("фізичне видалення fail-closed без повної перевірки посилань", () => {
  assert.throws(
    () =>
      assertCatalogEntryCanBePhysicallyDeleted({
        referencesChecked: false,
        isReferenced: false,
      }),
    Error,
  );
  assert.throws(
    () =>
      assertCatalogEntryCanBePhysicallyDeleted({
        referencesChecked: true,
        isReferenced: true,
      }),
    RangeError,
  );
  assert.equal(
    assertCatalogEntryCanBePhysicallyDeleted({
      referencesChecked: true,
      isReferenced: false,
    }),
    true,
  );
});

test("початковий catalog має очікувані ресурси та унікальні сталі ID/коди", () => {
  assert.equal(initialCatalogEntries.length, 37);
  assert.equal(
    initialCatalogEntries.filter((entry) => entry.kind === CATALOG_KIND.ROOM)
      .length,
    20,
  );
  assert.equal(
    initialCatalogEntries.filter((entry) => entry.roomType === ROOM_TYPE.GROUP)
      .length,
    15,
  );
  assert.equal(
    initialCatalogEntries.filter(
      (entry) => entry.roomType === ROOM_TYPE.SERVICE,
    ).length,
    5,
  );
  assert.equal(
    new Set(initialCatalogEntries.map((entry) => entry._id)).size,
    37,
  );
  assert.equal(
    new Set(initialCatalogEntries.map((entry) => `${entry.kind}:${entry.code}`))
      .size,
    37,
  );
  assert.ok(
    initialCatalogEntries.every((entry) => /^[a-f0-9]{24}$/.test(entry._id)),
  );
});
