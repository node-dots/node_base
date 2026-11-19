import { jsonResponse } from "../../openapi/common.js";
import { z } from "../../openapi/zod.js";
import { HTTP_STATUS } from "../../utils/httpConstants.js";
import {
  accountRolesResponseSchema,
  assignAccountRolesSchema,
} from "./accountRoles.schema.js";

const personIdParamsSchema = z
  .strictObject({
    id: z.string().regex(/^[a-f\d]{24}$/i),
  })
  .meta({ id: "PersonIdParams" });

export function registerAccountRolesDocumentation(registry) {
  for (const schema of [
    personIdParamsSchema,
    assignAccountRolesSchema,
    accountRolesResponseSchema,
  ]) {
    registry.register(schema.meta().id, schema);
  }
  registry.registerPath({
    method: "put",
    path: "/api/v1/people/{id}/account/roles",
    operationId: "assignAccountRoles",
    tags: ["Облікові записи"],
    summary: "Замінити ролі облікового запису",
    description:
      "Лише ADMIN. Ролі перевіряються за профілем працівника; зміна й аудит атомарні. Останнього активного ADMIN зняти не можна.",
    security: [{ BearerAuth: [] }],
    request: {
      params: personIdParamsSchema,
      body: {
        required: true,
        content: { "application/json": { schema: assignAccountRolesSchema } },
      },
    },
    responses: {
      [HTTP_STATUS.OK]: jsonResponse(
        accountRolesResponseSchema,
        "Набір ролей замінено; старі access tokens відкликані.",
      ),
      [HTTP_STATUS.BAD_REQUEST]: { $ref: "#/components/responses/BadRequest" },
      [HTTP_STATUS.UNAUTHORIZED]: { description: "Потрібна автентифікація." },
      [HTTP_STATUS.FORBIDDEN]: { description: "Недостатньо прав." },
      [HTTP_STATUS.NOT_FOUND]: { $ref: "#/components/responses/NotFound" },
      [HTTP_STATUS.CONFLICT]: {
        description: "Обліковий запис змінився або це останній ADMIN.",
      },
      [HTTP_STATUS.UNPROCESSABLE_ENTITY]: {
        $ref: "#/components/responses/DomainRuleViolation",
      },
      [HTTP_STATUS.INTERNAL_SERVER_ERROR]: {
        $ref: "#/components/responses/InternalError",
      },
    },
  });
}
