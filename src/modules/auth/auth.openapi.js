import { jsonResponse } from "../../openapi/common.js";
import { HTTP_STATUS } from "../../utils/httpConstants.js";
import {
  accessTokenResponseSchema,
  actorResponseSchema,
  changePasswordInputSchema,
  loginInputSchema,
  passwordChangedResponseSchema,
  sessionsRevokedResponseSchema,
} from "./auth.schema.js";

const unauthorized = {
  description: "Відсутня чинна автентифікація або облікові дані неправильні.",
};
const tooManyRequests = {
  $ref: "#/components/responses/TooManyRequests",
};
const internalError = {
  $ref: "#/components/responses/InternalError",
};

export function registerAuthDocumentation(registry) {
  for (const schema of [
    loginInputSchema,
    changePasswordInputSchema,
    accessTokenResponseSchema,
    actorResponseSchema,
    passwordChangedResponseSchema,
    sessionsRevokedResponseSchema,
  ]) {
    registry.register(schema.meta().id, schema);
  }

  registry.registerComponent("securitySchemes", "BearerAuth", {
    type: "http",
    scheme: "bearer",
    bearerFormat: "JWT",
  });

  registry.registerPath({
    method: "post",
    path: "/api/v1/auth/login",
    operationId: "login",
    tags: ["Автентифікація"],
    summary: "Увійти за email і паролем",
    request: {
      body: {
        required: true,
        content: { "application/json": { schema: loginInputSchema } },
      },
    },
    responses: {
      [HTTP_STATUS.OK]: jsonResponse(
        accessTokenResponseSchema,
        "Короткотривалий access JWT.",
      ),
      [HTTP_STATUS.BAD_REQUEST]: {
        $ref: "#/components/responses/BadRequest",
      },
      [HTTP_STATUS.UNAUTHORIZED]: unauthorized,
      [HTTP_STATUS.TOO_MANY_REQUESTS]: tooManyRequests,
      [HTTP_STATUS.INTERNAL_SERVER_ERROR]: internalError,
    },
  });

  registry.registerPath({
    method: "get",
    path: "/api/v1/auth/me",
    operationId: "getCurrentActor",
    tags: ["Автентифікація"],
    summary: "Перевірити поточний обліковий запис",
    security: [{ BearerAuth: [] }],
    responses: {
      [HTTP_STATUS.OK]: jsonResponse(
        actorResponseSchema,
        "Актуальні ID та ролі з MongoDB.",
      ),
      [HTTP_STATUS.UNAUTHORIZED]: unauthorized,
    },
  });

  registry.registerPath({
    method: "post",
    path: "/api/v1/auth/password",
    operationId: "changeOwnPassword",
    tags: ["Автентифікація"],
    summary: "Змінити власний пароль і відкликати access tokens",
    security: [{ BearerAuth: [] }],
    request: {
      body: {
        required: true,
        content: {
          "application/json": { schema: changePasswordInputSchema },
        },
      },
    },
    responses: {
      [HTTP_STATUS.OK]: jsonResponse(
        passwordChangedResponseSchema,
        "Пароль змінено.",
      ),
      [HTTP_STATUS.BAD_REQUEST]: {
        $ref: "#/components/responses/BadRequest",
      },
      [HTTP_STATUS.UNAUTHORIZED]: unauthorized,
      [HTTP_STATUS.UNPROCESSABLE_ENTITY]: {
        $ref: "#/components/responses/DomainRuleViolation",
      },
      [HTTP_STATUS.TOO_MANY_REQUESTS]: tooManyRequests,
    },
  });

  registry.registerPath({
    method: "post",
    path: "/api/v1/auth/logout-all",
    operationId: "logoutAllSessions",
    tags: ["Автентифікація"],
    summary: "Відкликати всі access tokens облікового запису",
    security: [{ BearerAuth: [] }],
    responses: {
      [HTTP_STATUS.OK]: jsonResponse(
        sessionsRevokedResponseSchema,
        "Старі токени відкликані.",
      ),
      [HTTP_STATUS.UNAUTHORIZED]: unauthorized,
      [HTTP_STATUS.TOO_MANY_REQUESTS]: tooManyRequests,
    },
  });
}
