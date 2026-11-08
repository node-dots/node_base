import {
  createGroupSchema,
  groupSchema,
  groupResponseSchema,
  groupListResponseSchema,
  ageSummarySchema,
  ageSummaryResponseSchema,
  groupIdParamsSchema,
  groupListQuerySchema,
} from "./group.schema.js";
import { jsonResponse } from "../../openapi/common.js";
import { HTTP_STATUS } from "../../utils/httpConstants.js";
import {
  groupResourcesSchema,
  updateGroupCapacitySchema,
} from "./groupResources.schema.js";

// Схеми й обмеження беруться з Zod; призначення операцій описуємо явно.
export function registerGroupDocumentation(registry) {
  registry.register("GroupResourcesInput", groupResourcesSchema);
  registry.register("UpdateGroupCapacityInput", updateGroupCapacitySchema);
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
    [HTTP_STATUS.UNAUTHORIZED]: {
      description: "Потрібна чинна автентифікація.",
    },
    [HTTP_STATUS.FORBIDDEN]: {
      description: "Недостатньо прав для цієї дії.",
    },
    [HTTP_STATUS.TOO_MANY_REQUESTS]: {
      $ref: "#/components/responses/TooManyRequests",
    },
    [HTTP_STATUS.INTERNAL_SERVER_ERROR]: {
      $ref: "#/components/responses/InternalError",
    },
  };
  registry.registerPath({
    method: "get",
    path: "/api/v1/groups",
    operationId: "listGroups",
    tags: ["Групи"],
    summary: "Переглянути сторінку груп",
    security: [{ BearerAuth: [] }],
    description:
      "Повертає групи зі стабільним сортуванням за ID. За межами списку data порожній.",
    request: {
      query: groupListQuerySchema,
    },
    responses: {
      [HTTP_STATUS.OK]: jsonResponse(
        groupListResponseSchema,
        "Сторінка груп і метадані пагінації.",
      ),
      [HTTP_STATUS.BAD_REQUEST]: {
        $ref: "#/components/responses/BadRequest",
      },
      ...commonErrors,
    },
  });
  for (const [path, method, operationId, summary, bodySchema] of [
    [
      "/api/v1/groups/{id}/resources",
      "put",
      "updateGroupResources",
      "Активувати групу або змінити її ресурси",
      groupResourcesSchema,
    ],
    [
      "/api/v1/groups/{id}/capacity",
      "patch",
      "updateGroupCapacity",
      "Змінити місткість групи",
      updateGroupCapacitySchema,
    ],
  ]) {
    registry.registerPath({
      method,
      path,
      operationId,
      tags: ["Групи"],
      summary,
      security: [{ BearerAuth: [] }],
      request: {
        params: groupIdParamsSchema,
        body: {
          required: true,
          content: { "application/json": { schema: bodySchema } },
        },
      },
      responses: {
        [HTTP_STATUS.OK]: jsonResponse(
          groupResponseSchema,
          "Зміни групи збережено.",
        ),
        [HTTP_STATUS.BAD_REQUEST]: {
          $ref: "#/components/responses/BadRequest",
        },
        [HTTP_STATUS.CONFLICT]: {
          description: "Конфлікт стану, місткості або спільного ресурсу.",
        },
        [HTTP_STATUS.UNPROCESSABLE_ENTITY]: {
          $ref: "#/components/responses/DomainRuleViolation",
        },
        ...commonErrors,
      },
    });
  }
  for (const [path, operationId, summary] of [
    [
      "/api/v1/groups/{id}/deactivate",
      "deactivateGroup",
      "Деактивувати порожню групу",
    ],
    [
      "/api/v1/groups/{id}/transfer-next-year",
      "transferGroupToNextSchoolYear",
      "Підготувати групу для наступного навчального року",
    ],
  ]) {
    registry.registerPath({
      method: "post",
      path,
      operationId,
      tags: ["Групи"],
      summary,
      security: [{ BearerAuth: [] }],
      request: { params: groupIdParamsSchema },
      responses: {
        [HTTP_STATUS.OK]: { description: "Команду виконано атомарно." },
        [HTTP_STATUS.CONFLICT]: {
          description: "Група має зайняті місця або не готова до переходу.",
        },
        ...commonErrors,
      },
    });
  }
  registry.registerPath({
    method: "post",
    path: "/api/v1/groups",
    operationId: "createGroup",
    tags: ["Групи"],
    summary: "Створити чернетку групи",
    security: [{ BearerAuth: [] }],
    description:
      "Невідомі поля відхиляються. Нова група має статус DRAFT; кімнати та персонал ще не призначаються.",
    request: {
      body: {
        required: true,
        content: { "application/json": { schema: createGroupSchema } },
      },
    },
    responses: {
      [HTTP_STATUS.CREATED]: jsonResponse(
        groupResponseSchema,
        "Групу збережено в MongoDB.",
        {
          Location: {
            description: "Відносна адреса створеної групи.",
            schema: { type: "string" },
            example: "/api/v1/groups/000000000000000000000001",
          },
        },
      ),
      [HTTP_STATUS.BAD_REQUEST]: { $ref: "#/components/responses/BadRequest" },
      [HTTP_STATUS.PAYLOAD_TOO_LARGE]: {
        $ref: "#/components/responses/PayloadTooLarge",
      },
      [HTTP_STATUS.UNPROCESSABLE_ENTITY]: {
        $ref: "#/components/responses/DomainRuleViolation",
      },
      ...commonErrors,
    },
  });
  registry.registerPath({
    method: "get",
    path: "/api/v1/groups/{id}",
    operationId: "getGroup",
    tags: ["Групи"],
    summary: "Переглянути групу за ID",
    security: [{ BearerAuth: [] }],
    request: { params: groupIdParamsSchema },
    responses: {
      [HTTP_STATUS.OK]: jsonResponse(groupResponseSchema, "Групу знайдено."),
      [HTTP_STATUS.NOT_FOUND]: { $ref: "#/components/responses/NotFound" },
      ...commonErrors,
    },
  });
  registry.registerPath({
    method: "get",
    path: "/api/v1/groups/summary",
    operationId: "getGroupsAgeSummary",
    tags: ["Групи"],
    summary: "Підсумки груп за віковими категоріями",
    security: [{ BearerAuth: [] }],
    description:
      "MongoDB Aggregation Framework: кількість груп і сумарна місткість. Місткість не є кількістю зарахованих дітей.",
    responses: {
      [HTTP_STATUS.OK]: jsonResponse(
        ageSummaryResponseSchema,
        "Підсумки відсортовані за віком.",
      ),
      ...commonErrors,
    },
  });
}
