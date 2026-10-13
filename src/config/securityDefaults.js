// Налаштування захисту для локального навчального сервера.
export const SECURITY_DEFAULTS = Object.freeze({
  RATE_LIMIT_WINDOW_MS: 60_000, // Вікно підрахунку запитів: одна хвилина.
  RATE_LIMIT_REQUESTS: 300, // Загальна кількість запитів з однієї IP-адреси.
  WRITE_RATE_LIMIT_REQUESTS: 30, // Операції запису з однієї IP-адреси за хвилину.
  JSON_BODY_LIMIT_BYTES: 32 * 1024, // Максимальне тіло JSON: 32 КБ.
  HEADERS_TIMEOUT_MS: 10_000, // Час отримання заголовків.
  REQUEST_TIMEOUT_MS: 30_000, // Час отримання всього запиту.
  SOCKET_IDLE_TIMEOUT_MS: 30_000, // Максимальна бездіяльність з’єднання.
  KEEP_ALIVE_TIMEOUT_MS: 5_000, // Очікування наступного запиту після відповіді.
  SHUTDOWN_TIMEOUT_MS: 5_000, // Час коректного завершення процесу.
});
