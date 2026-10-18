import { z as zod } from "zod";
import { SECURITY_DEFAULTS } from "./securityDefaults.js";

// Додатні цілі числа; порожній рядок або нуль не вимикає захист непомітно.
function positiveInteger(defaultValue, maximumValue) {
  return zod.coerce
    .number()
    .int()
    .positive()
    .max(maximumValue)
    .default(defaultValue);
}

const securityEnvironmentSchema = zod
  .object({
    RATE_LIMIT_WINDOW_MS: positiveInteger(
      SECURITY_DEFAULTS.RATE_LIMIT_WINDOW_MS,
      2_147_483_647,
    ),
    RATE_LIMIT_REQUESTS: positiveInteger(
      SECURITY_DEFAULTS.RATE_LIMIT_REQUESTS,
      100_000,
    ),
    WRITE_RATE_LIMIT_REQUESTS: positiveInteger(
      SECURITY_DEFAULTS.WRITE_RATE_LIMIT_REQUESTS,
      100_000,
    ),
    JSON_BODY_LIMIT_BYTES: positiveInteger(
      SECURITY_DEFAULTS.JSON_BODY_LIMIT_BYTES,
      1024 * 1024,
    ),
    HEADERS_TIMEOUT_MS: positiveInteger(
      SECURITY_DEFAULTS.HEADERS_TIMEOUT_MS,
      300_000,
    ),
    REQUEST_TIMEOUT_MS: positiveInteger(
      SECURITY_DEFAULTS.REQUEST_TIMEOUT_MS,
      300_000,
    ),
    SOCKET_IDLE_TIMEOUT_MS: positiveInteger(
      SECURITY_DEFAULTS.SOCKET_IDLE_TIMEOUT_MS,
      300_000,
    ),
    KEEP_ALIVE_TIMEOUT_MS: positiveInteger(
      SECURITY_DEFAULTS.KEEP_ALIVE_TIMEOUT_MS,
      300_000,
    ),
  })
  .refine(
    (settings) => settings.HEADERS_TIMEOUT_MS <= settings.REQUEST_TIMEOUT_MS,
    {
      message:
        "Час отримання заголовків не може перевищувати час отримання запиту",
    },
  );

export function readSecurityConfig(environment = process.env) {
  const result = securityEnvironmentSchema.safeParse(environment);
  if (!result.success) {
    // Не друкуємо весь environment: він може містити секрети.
    const explanation = result.error.issues
      .map(
        (issue) => `${issue.path.join(".") || "Тайм-аути"}: ${issue.message}`,
      )
      .join("; ");
    throw new Error(`Некоректні налаштування захисту: ${explanation}`);
  }
  return Object.freeze(result.data);
}
