import { z as zod } from "../../openapi/zod.js";
import { PERSON_LIMITS } from "./person.constants.js";

// Спільні обмеження для імені, прізвища та по батькові.
const nameSchema = zod
  .string()
  .trim()
  .min(PERSON_LIMITS.MIN_NAME_LENGTH, "Поле не може бути порожнім")
  .max(
    PERSON_LIMITS.MAX_NAME_LENGTH,
    `Максимальна довжина — ${PERSON_LIMITS.MAX_NAME_LENGTH} символів`,
  );

// Вхідний контракт створення базового профілю людини.
export const createPersonSchema = zod
  .strictObject({
    firstName: nameSchema,
    lastName: nameSchema,
    middleName: nameSchema.optional(),
    phone: zod
      .string()
      .trim()
      .min(1, "Телефон не може бути порожнім")
      .max(
        PERSON_LIMITS.MAX_PHONE_LENGTH,
        `Максимальна довжина телефону — ${PERSON_LIMITS.MAX_PHONE_LENGTH} символів`,
      )
      .optional(),
  })
  .meta({ id: "CreatePersonInput" });
