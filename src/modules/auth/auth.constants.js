export const ACCESS_TOKEN_TTL_SECONDS = 30 * 60;
export const BCRYPT_COST = 12;
export const BCRYPT_MAX_BYTES = 72;
export const MIN_PASSWORD_LENGTH = 12;

export const AUTH_ERROR_CODES = Object.freeze({
  INVALID_CREDENTIALS: "INVALID_CREDENTIALS",
  AUTHENTICATION_REQUIRED: "AUTHENTICATION_REQUIRED",
  PASSWORD_UNCHANGED: "PASSWORD_UNCHANGED",
});

export const AUTH_ERROR_MESSAGES = Object.freeze({
  INVALID_CREDENTIALS: "Невірний email або пароль",
  AUTHENTICATION_REQUIRED: "Потрібна чинна автентифікація",
  PASSWORD_UNCHANGED: "Новий пароль має відрізнятися від поточного",
});
