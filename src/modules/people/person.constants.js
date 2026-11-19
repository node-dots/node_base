// Статус профілю людини; не визначає доступ до API чи зайнятість.
export const PERSON_STATUS = Object.freeze({
  ACTIVE: "ACTIVE",
  INACTIVE: "INACTIVE",
});

// Ролі доступу з узгодженого контракту. Посада працівника зберігається окремо.
export const ACCOUNT_ROLE = Object.freeze({
  ADMIN: "ADMIN",
  MANAGER: "MANAGER",
  PARENT: "PARENT",
  TEACHER: "TEACHER",
  EDUCATOR: "EDUCATOR",
  ASSISTANT: "ASSISTANT",
});

// Базові стани працівника; детальні кадрові переходи належать TASK-014.
export const EMPLOYEE_STATUS = Object.freeze({
  ACTIVE: "ACTIVE",
  ON_LEAVE: "ON_LEAVE",
  SICK_LEAVE: "SICK_LEAVE",
  TERMINATED: "TERMINATED",
});

export const EMPLOYEE_WEEKDAYS = Object.freeze([1, 2, 3, 4, 5]);
export const EMPLOYEE_LIMITS = Object.freeze({
  MAX_AVAILABILITY_WINDOWS: 20,
  MAX_SALARY_MINOR: Number.MAX_SAFE_INTEGER,
});

// Обмеження базових полів людини.
export const PERSON_LIMITS = Object.freeze({
  MIN_NAME_LENGTH: 1,
  MAX_NAME_LENGTH: 100,
  MAX_PHONE_LENGTH: 32,
  MAX_EMAIL_LENGTH: 254,
  MAX_PASSWORD_HASH_LENGTH: 255,
  MAX_POSITION_CODE_LENGTH: 64,
});

// Коди помилок модуля людей.
export const PERSON_ERROR_CODES = Object.freeze({
  INVALID_FIELD: "INVALID_PERSON_FIELD",
  NOT_FOUND: "PERSON_NOT_FOUND",
});
