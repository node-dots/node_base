// Стани групи: повну процедуру активації додамо після призначення ресурсів.
export const GROUP_STATUS = Object.freeze({
  DRAFT: 'DRAFT', // Чернетка без усіх обов’язкових призначень.
});

// Коди порушень бізнес-правил групи.
export const GROUP_ERROR_CODES = Object.freeze({
  INVALID_NAME: 'INVALID_GROUP_NAME', // Некоректна назва.
  INVALID_AGE_CATEGORY: 'INVALID_AGE_CATEGORY', // Неприпустимий вік.
  INVALID_CAPACITY: 'INVALID_GROUP_CAPACITY', // Неприпустима місткість.
  NOT_FOUND: 'GROUP_NOT_FOUND', // Група відсутня.
});

// Початкові бізнес-обмеження групи.
export const GROUP_LIMITS = Object.freeze({
  MIN_NAME_LENGTH: 1,
  MAX_NAME_LENGTH: 100,
  MIN_AGE_CATEGORY: 2,
  MAX_AGE_CATEGORY: 5,
  MIN_CAPACITY: 1,
  MAX_CAPACITY: 20,
});
