import { z } from './zod.js';
import packageInfo from '../../package.json' with { type: 'json' };
import { HTTP_STATUS, READINESS_STATUS } from '../utils/httpConstants.js';

export const errorResponseSchema = z
  .strictObject({
    error: z.strictObject({
      code: z.string(),
      message: z.string(),
      details: z.unknown().optional(),
      requestId: z.uuid(),
    }),
  })
  .meta({ id: 'ErrorResponse' });

export const healthResponseSchema = z
  .strictObject({
    data: z.strictObject({
      status: z.literal('OK'),
      service: z.literal('kindergarten-backend'),
      storage: z.literal('MONGODB'),
    }),
  })
  .meta({ id: 'HealthResponse' });

export const apiInfoResponseSchema = z
  .strictObject({
    data: z.strictObject({
      name: z.string(),
      version: z.literal(packageInfo.version),
      documentation: z.literal('/api-docs/'),
      openapi: z.literal('/api/v1/openapi.json'),
    }),
  })
  .meta({ id: 'ApiInfoResponse' });

export const readinessResponseSchema = z
  .strictObject({
    data: z.strictObject({
      status: z.enum(Object.values(READINESS_STATUS)),
      storage: z.literal('MONGODB'),
    }),
  })
  .meta({ id: 'ReadinessResponse' });

const requestIdHeader = {
  description: 'Ідентифікатор запиту для пошуку в логах.',
  schema: { type: 'string', format: 'uuid' },
};

// Невеликий helper прибирає повтор формату JSON і заголовка в описах операцій.
export function jsonResponse(schema, description, headers = {}) {
  return {
    description,
    headers: { 'X-Request-Id': requestIdHeader, ...headers },
    content: { 'application/json': { schema } },
  };
}

export function registerCommonDocumentation(registry) {
  for (const schema of [
    errorResponseSchema,
    healthResponseSchema,
    readinessResponseSchema,
    apiInfoResponseSchema,
  ]) {
    registry.register(schema.meta().id, schema);
  }

  const errors = {
    BadRequest: 'Некоректний JSON або дані не відповідають вхідній схемі.',
    NotFound: 'Групу або маршрут не знайдено.',
    PayloadTooLarge: 'Тіло JSON перевищує налаштований ліміт; початково 32 КБ.',
    DomainRuleViolation: 'Порушено бізнес-правило; BusinessError перетворюється на HTTP-помилку.',
    TooManyRequests:
      'RATE_LIMIT_EXCEEDED або WRITE_RATE_LIMIT_EXCEEDED. Заблокований запит не виконує сценарій.',
    InternalError: 'Непередбачена помилка без технічних секретів у відповіді.',
  };
  for (const [name, description] of Object.entries(errors)) {
    const headers =
      name === 'TooManyRequests'
        ? {
            'Retry-After': {
              description: 'Час очікування в секундах.',
              schema: { type: 'integer', minimum: 1 },
            },
            RateLimit: {
              description: 'Поточний стан обмеження частоти запитів.',
              schema: { type: 'string' },
            },
            'RateLimit-Policy': {
              description: 'Налаштовані політики обмеження.',
              schema: { type: 'string' },
            },
          }
        : {};
    registry.registerComponent(
      'responses',
      name,
      jsonResponse({ $ref: '#/components/schemas/ErrorResponse' }, description, headers),
    );
  }

  const commonErrors = {
    [HTTP_STATUS.TOO_MANY_REQUESTS]: { $ref: '#/components/responses/TooManyRequests' },
    [HTTP_STATUS.INTERNAL_SERVER_ERROR]: { $ref: '#/components/responses/InternalError' },
  };
  registry.registerPath({
    method: 'get',
    path: '/health/live',
    operationId: 'getLiveness',
    tags: ['Стан'],
    summary: 'Перевірити роботу процесу',
    description: 'Перевіряє процес сервера; не виконує запит готовності MongoDB.',
    responses: {
      [HTTP_STATUS.OK]: jsonResponse(healthResponseSchema, 'Процес працює.'),
      ...commonErrors,
    },
  });
  registry.registerPath({
    method: 'get',
    path: '/health/ready',
    operationId: 'getReadiness',
    tags: ['Стан'],
    summary: 'Перевірити готовність API та MongoDB',
    description:
      'Перевіряє відкрите з’єднання та ping MongoDB з лімітом 2 секунди. Не розкриває URI або технічні помилки.',
    responses: {
      [HTTP_STATUS.OK]: jsonResponse(readinessResponseSchema, 'MongoDB відповідає; status READY.'),
      [HTTP_STATUS.SERVICE_UNAVAILABLE]: jsonResponse(
        readinessResponseSchema,
        'MongoDB недоступна; status NOT_READY.',
      ),
      ...commonErrors,
    },
  });
  registry.registerPath({
    method: 'get',
    path: '/api/v1',
    operationId: 'getApiInfo',
    tags: ['Стан'],
    summary: 'Версія API та посилання на документацію',
    responses: {
      [HTTP_STATUS.OK]: jsonResponse(apiInfoResponseSchema, 'Опис початкового API.'),
      ...commonErrors,
    },
  });
  registry.registerPath({
    method: 'get',
    path: '/api/v1/openapi.json',
    operationId: 'getOpenApiDocument',
    tags: ['Документація'],
    summary: 'Отримати цей OpenAPI-контракт',
    responses: {
      [HTTP_STATUS.OK]: jsonResponse({ type: 'object' }, 'OpenAPI-документ.'),
      ...commonErrors,
    },
  });
  registry.registerPath({
    method: 'get',
    path: '/api-docs/',
    operationId: 'getSwaggerUi',
    tags: ['Документація'],
    summary: 'Відкрити локальний Swagger UI',
    responses: {
      [HTTP_STATUS.OK]: {
        description: 'Сторінка перегляду та виконання запитів API.',
        content: { 'text/html': { schema: { type: 'string' } } },
      },
      ...commonErrors,
    },
  });
}
