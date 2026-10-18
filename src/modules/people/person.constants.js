// Статус профілю людини; не визначає доступ до API чи зайнятість.
export const PERSON_STATUS = Object.freeze({
  ACTIVE: "ACTIVE",
  INACTIVE: "INACTIVE",
});

// Обмеження базових полів людини.
export const PERSON_LIMITS = Object.freeze({
  MIN_NAME_LENGTH: 1,
  MAX_NAME_LENGTH: 100,
  MAX_PHONE_LENGTH: 32,
});

// Коди помилок модуля людей.
export const PERSON_ERROR_CODES = Object.freeze({
  INVALID_FIELD: "INVALID_PERSON_FIELD",
  NOT_FOUND: "PERSON_NOT_FOUND",
});
