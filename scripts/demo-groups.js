import { buildGroupDraft } from "../src/modules/groups/group.service.js";

// Сталі ID дозволяють повторювати seed без дублів і без пошуку за змінною назвою.
const examples = [
  [1, "Сонечка", 2, 20],
  [2, "Зайченята", 2, 16],
  [3, "Зірочки", 3, 20],
  [4, "Капітошки", 3, 18],
  [5, "Веселка", 4, 20],
  [6, "Мандрівники", 4, 18],
  [7, "Дослідники", 5, 20],
  [8, "Мрійники", 5, 16],
];

export const demoGroups = examples.map(
  ([seedId, name, ageCategory, capacity]) => ({
    _id: seedId.toString(16).padStart(24, "0"),
    ...buildGroupDraft({ name, ageCategory, capacity }),
  }),
);
