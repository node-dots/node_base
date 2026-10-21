import { BusinessError, ResourceNotFoundError } from "../../utils/errors.js";
import {
  PERSON_STATUS,
  PERSON_LIMITS,
  PERSON_ERROR_CODES,
} from "./person.constants.js";

// Перевіряє тип і довжину тексту, прибирає зайві пробіли по краях.
function normalizeText(value, field, maxLength) {
  if (typeof value !== "string") {
    throw new BusinessError(
      PERSON_ERROR_CODES.INVALID_FIELD,
      "Поле має бути рядком",
      [{ field }],
    );
  }

  const normalized = value.trim();

  if (normalized.length === 0 || normalized.length > maxLength) {
    throw new BusinessError(
      PERSON_ERROR_CODES.INVALID_FIELD,
      `Поле має містити від 1 до ${maxLength} символів`,
      [{ field }],
    );
  }

  return normalized;
}

// Створення профілю не створює обліковий запис чи профіль працівника.
export function buildPerson({ firstName, lastName, middleName, phone }) {
  return {
    firstName: normalizeText(
      firstName,
      "firstName",
      PERSON_LIMITS.MAX_NAME_LENGTH,
    ),
    lastName: normalizeText(
      lastName,
      "lastName",
      PERSON_LIMITS.MAX_NAME_LENGTH,
    ),
    middleName:
      middleName === undefined
        ? undefined
        : normalizeText(
            middleName,
            "middleName",
            PERSON_LIMITS.MAX_NAME_LENGTH,
          ),
    phone:
      phone === undefined
        ? undefined
        : normalizeText(phone, "phone", PERSON_LIMITS.MAX_PHONE_LENGTH),
    status: PERSON_STATUS.ACTIVE,
  };
}

export class PersonService {
  constructor({ personRepository }) {
    this.personRepository = personRepository;
  }

  async createPerson(input) {
    const person = buildPerson(input);

    return this.personRepository.insert(person);
  }

  async getPerson(personId) {
    const person = await this.personRepository.findById(personId);

    if (!person) {
      throw new ResourceNotFoundError(
        PERSON_ERROR_CODES.NOT_FOUND,
        "Людину не знайдено",
      );
    }

    return person;
  }
}
