// HTTP — протокол запитів і відповідей. Статуси використовує тільки Presentation.
export const HTTP_STATUS = Object.freeze({
  OK: 200, // Запит успішний.
  CREATED: 201, // Ресурс створено.
  BAD_REQUEST: 400, // Некоректний запит.
  UNAUTHORIZED: 401, // Немає дійсної автентифікації.
  FORBIDDEN: 403, // Дія заборонена.
  NOT_FOUND: 404, // Ресурс або маршрут не знайдено.
  CONFLICT: 409, // Конфлікт поточного стану.
  PAYLOAD_TOO_LARGE: 413, // Тіло запиту завелике.
  UNPROCESSABLE_ENTITY: 422, // Порушено бізнес-правило.
  TOO_MANY_REQUESTS: 429, // Перевищено дозволену частоту запитів.
  INTERNAL_SERVER_ERROR: 500, // Непередбачена помилка сервера.
  SERVICE_UNAVAILABLE: 503, // Застосунок не готовий працювати зі сховищем.
});

export const READINESS_STATUS = Object.freeze({
  READY: 'READY', // Сховище відповідає, API готове до роботи.
  NOT_READY: 'NOT_READY', // З’єднання відсутнє або перевірка сховища неуспішна.
});

// Значення type, які повертає парсер тіла запиту Express.
export const BODY_PARSER_ERROR_TYPES = Object.freeze({
  INVALID_JSON: 'entity.parse.failed', // Не вдалося розібрати JSON.
  BODY_TOO_LARGE: 'entity.too.large', // Перевищено допустимий розмір.
});

// Публічні коди загальних HTTP-помилок для клієнта.
export const HTTP_ERROR_CODES = Object.freeze({
  VALIDATION_ERROR: 'VALIDATION_ERROR', // Вхідні дані не відповідають схемі.
  INVALID_JSON: 'INVALID_JSON', // Некоректний JSON.
  BODY_TOO_LARGE: 'BODY_TOO_LARGE', // Надто велике тіло запиту.
  ROUTE_NOT_FOUND: 'ROUTE_NOT_FOUND', // Адреса запиту не визначена.
  INTERNAL_ERROR: 'INTERNAL_ERROR', // Непередбачена помилка.
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED', // Перевищено загальний ліміт.
  WRITE_RATE_LIMIT_EXCEEDED: 'WRITE_RATE_LIMIT_EXCEEDED', // Перевищено ліміт запису.
});
