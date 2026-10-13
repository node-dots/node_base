import {
  createGroupSchema,
  groupSchema,
  groupResponseSchema,
  groupListResponseSchema,
  ageSummarySchema,
  ageSummaryResponseSchema,
  groupIdParamsSchema,
} from './group.schema.js';
import { jsonResponse } from '../../openapi/common.js';
import { HTTP_STATUS } from '../../utils/httpConstants.js';

// Схеми й обмеження беруться з Zod; призначення операцій описуємо явно.
export function registerGroupDocumentation(registry) {
  for (const schema of [
    createGroupSchema,
    groupSchema,
    groupResponseSchema,
    groupListResponseSchema,
    ageSummarySchema,
    ageSummaryResponseSchema,
  ]) {
    registry.register(schema.meta().id, schema);
  }
  const commonErrors = {
    [HTTP_STATUS.TOO_MANY_REQUESTS]: { $ref: '#/components/responses/TooManyRequests' },
    [HTTP_STATUS.INTERNAL_SERVER_ERROR]: { $ref: '#/components/responses/InternalError' },
  };
  registry.registerPath({
    method: 'get',
    path: '/api/v1/groups',
    operationId: 'listGroups',
    tags: ['Групи'],
    summary: 'Переглянути всі демонстраційні групи',
    description: 'Пагінація й фільтри ще не реалізовані.',
    responses: {
      [HTTP_STATUS.OK]: jsonResponse(groupListResponseSchema, 'Список груп і meta.total.'),
      ...commonErrors,
    },
  });
  registry.registerPath({
    method: 'post',
    path: '/api/v1/groups',
    operationId: 'createGroup',
    tags: ['Групи'],
    summary: 'Створити чернетку групи',
    description:
      'Невідомі поля відхиляються. Нова група має статус DRAFT; кімнати та персонал ще не призначаються.',
    request: {
      body: { required: true, content: { 'application/json': { schema: createGroupSchema } } },
    },
    responses: {
      [HTTP_STATUS.CREATED]: jsonResponse(groupResponseSchema, 'Групу збережено в MongoDB.', {
        Location: {
          description: 'Відносна адреса створеної групи.',
          schema: { type: 'string' },
          example: '/api/v1/groups/000000000000000000000001',
        },
      }),
      [HTTP_STATUS.BAD_REQUEST]: { $ref: '#/components/responses/BadRequest' },
      [HTTP_STATUS.PAYLOAD_TOO_LARGE]: { $ref: '#/components/responses/PayloadTooLarge' },
      [HTTP_STATUS.UNPROCESSABLE_ENTITY]: { $ref: '#/components/responses/DomainRuleViolation' },
      ...commonErrors,
    },
  });
  registry.registerPath({
    method: 'get',
    path: '/api/v1/groups/{id}',
    operationId: 'getGroup',
    tags: ['Групи'],
    summary: 'Переглянути групу за ID',
    request: { params: groupIdParamsSchema },
    responses: {
      [HTTP_STATUS.OK]: jsonResponse(groupResponseSchema, 'Групу знайдено.'),
      [HTTP_STATUS.NOT_FOUND]: { $ref: '#/components/responses/NotFound' },
      ...commonErrors,
    },
  });
  registry.registerPath({
    method: 'get',
    path: '/api/v1/groups/summary',
    operationId: 'getGroupsAgeSummary',
    tags: ['Групи'],
    summary: 'Підсумки груп за віковими категоріями',
    description:
      'MongoDB Aggregation Framework: кількість груп і сумарна місткість. Місткість не є кількістю зарахованих дітей.',
    responses: {
      [HTTP_STATUS.OK]: jsonResponse(ageSummaryResponseSchema, 'Підсумки відсортовані за віком.'),
      ...commonErrors,
    },
  });
}
