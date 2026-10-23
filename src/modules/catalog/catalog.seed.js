import {
  CATALOG_KIND,
  POSITION_CODE,
  ROOM_TYPE,
  SUBJECT_CODE,
} from "./catalog.constants.js";

const stableId = (prefix, number) =>
  `${prefix}${number.toString(16).padStart(24 - prefix.length, "0")}`;

const ageCategories = [2, 3, 4, 5].map((age) => ({
  _id: stableId("10", age),
  kind: CATALOG_KIND.AGE_CATEGORY,
  code: `AGE_${age}`,
  name: `${age} роки`,
  active: true,
  age,
}));

const groupRooms = Array.from({ length: 15 }, (_, index) => ({
  _id: stableId("20", index + 1),
  kind: CATALOG_KIND.ROOM,
  code: `GROUP_ROOM_${String(index + 1).padStart(2, "0")}`,
  name: `Групова кімната ${index + 1}`,
  active: true,
  roomType: ROOM_TYPE.GROUP,
  capacity: 20,
}));

const serviceRooms = [
  ["CHILDREN_WASHROOM", "Санвузол дітей"],
  ["STAFF_WASHROOM", "Санвузол персоналу"],
  ["MANAGER_OFFICE", "Кабінет менеджера"],
  ["PSYCHOLOGIST_OFFICE", "Кабінет психолога"],
  ["STAFF_LOUNGE", "Кімната відпочинку персоналу"],
].map(([code, name], index) => ({
  _id: stableId("21", index + 1),
  kind: CATALOG_KIND.ROOM,
  code,
  name,
  active: true,
  roomType: ROOM_TYPE.SERVICE,
}));

const positionNames = {
  [POSITION_CODE.EDUCATOR]: "Вихователь",
  [POSITION_CODE.ASSISTANT]: "Помічник",
  [POSITION_CODE.TEACHER]: "Викладач",
  [POSITION_CODE.MANAGER]: "Менеджер",
  [POSITION_CODE.ADMINISTRATOR]: "Адміністратор",
  [POSITION_CODE.PSYCHOLOGIST]: "Психолог",
  [POSITION_CODE.SECURITY_GUARD]: "Охоронець",
  [POSITION_CODE.CLEANER]: "Прибиральник",
};

const positions = Object.values(POSITION_CODE).map((code, index) => ({
  _id: stableId("30", index + 1),
  kind: CATALOG_KIND.POSITION,
  code,
  name: positionNames[code],
  active: true,
}));

const subjectNames = {
  [SUBJECT_CODE.ENGLISH]: "Англійська",
  [SUBJECT_CODE.MUSIC]: "Музика",
  [SUBJECT_CODE.PHYSICAL_EDUCATION]: "Фізкультура",
  [SUBJECT_CODE.FREESTYLE_WRESTLING]: "Вільна боротьба",
  [SUBJECT_CODE.CHESS]: "Шахи",
};

const subjects = Object.values(SUBJECT_CODE).map((code, index) => ({
  _id: stableId("40", index + 1),
  kind: CATALOG_KIND.SUBJECT,
  code,
  name: subjectNames[code],
  active: true,
}));

const financialSeed = [
  {
    _id: stableId("50", 1),
    kind: CATALOG_KIND.TUITION_RATE,
    code: "TUITION_MONTHLY",
    name: "Monthly tuition",
    active: true,
    effectiveFrom: "2026-01-01",
    amountCents: 1_500_000,
  },
  ...[300, 400, 500, 600].map((uah, index) => ({
    _id: stableId("51", index + 1),
    kind: CATALOG_KIND.MEAL_RATE,
    code: `MEAL_AGE_${index + 2}`,
    name: `Meal age ${index + 2}`,
    active: true,
    effectiveFrom: "2026-01-01",
    ageCategoryCode: `AGE_${index + 2}`,
    amountCents: uah * 100,
  })),
  ...[1000, 2000, 3000].map((basisPoints, index) => ({
    _id: stableId("52", index + 1),
    kind: CATALOG_KIND.BENEFIT,
    code: `BENEFIT_${(index + 1) * 10}`,
    name: `Benefit ${(index + 1) * 10}%`,
    active: true,
    effectiveFrom: "2026-01-01",
    basisPoints,
  })),
  {
    _id: stableId("53", 1),
    kind: CATALOG_KIND.PROGRAM,
    code: "STANDARD_PROGRAM",
    name: "Standard weekly program",
    active: true,
    effectiveFrom: "2026-01-05",
    lessons: Object.values(SUBJECT_CODE).map((subjectCode) => ({
      subjectCode,
      sessionsPerWeek: 2,
      durationMinutes: 30,
    })),
  },
];

export const initialCatalogEntries = Object.freeze([
  ...ageCategories,
  ...groupRooms,
  ...serviceRooms,
  ...positions,
  ...subjects,
  ...financialSeed,
]);

export async function seedCatalog(catalogModel) {
  const operations = initialCatalogEntries.map(({ _id, ...entry }) => ({
    updateOne: {
      filter: { _id },
      update: { $setOnInsert: entry },
      upsert: true,
    },
  }));

  const result = await catalogModel.bulkWrite(operations, { ordered: true });
  return {
    inserted: result.upsertedCount,
    existing: initialCatalogEntries.length - result.upsertedCount,
  };
}
