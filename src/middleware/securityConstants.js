export const HTTP_METHODS = Object.freeze({
  POST: 'POST', // Створення ресурсу або команда.
  PUT: 'PUT', // Заміна ресурсу або його частини за контрактом.
  PATCH: 'PATCH', // Часткова зміна ресурсу.
  DELETE: 'DELETE', // Видалення ресурсу.
});

export const WRITE_METHODS = Object.freeze([
  HTTP_METHODS.POST,
  HTTP_METHODS.PUT,
  HTTP_METHODS.PATCH,
  HTTP_METHODS.DELETE,
]);

export const RATE_LIMIT_OPTIONS = Object.freeze({
  HEADER_FORMAT: 'draft-8', // Формат стандартних заголовків RateLimit.
  API_IDENTIFIER: 'all-requests', // Назва загальної політики в заголовках.
  WRITE_IDENTIFIER: 'write-requests', // Назва політики запису.
  API_REQUEST_PROPERTY: 'apiRateLimit', // Окремі дані загального ліміту в request.
  WRITE_REQUEST_PROPERTY: 'writeRateLimit', // Дані ліміту запису в request.
});
