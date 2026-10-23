import { jsonResponse } from "../../openapi/common.js";
import { HTTP_STATUS } from "../../utils/httpConstants.js";
import { createChildSchema, updateChildProfileSchema } from "./child.schema.js";
import { z as zod } from "../../openapi/zod.js";

const childId = zod.object({ id: zod.string().regex(/^[a-f\d]{24}$/i) });
const childSummary = zod.object({
  id: zod.string(),
  firstName: zod.string(),
  lastName: zod.string(),
  middleName: zod.string().optional(),
  dateOfBirth: zod.string(),
  status: zod.string(),
  groupId: zod.string().optional(),
  guardians: zod
    .array(zod.object({ personId: zod.string(), relationship: zod.string() }))
    .optional(),
  relatives: zod.array(zod.unknown()).optional(),
  food: zod.unknown().optional(),
  benefitCode: zod.string().optional(),
});
const response = zod.object({ data: childSummary });

export function registerChildDocumentation(registry) {
  registry.register("CreateChildInput", createChildSchema);
  registry.register("UpdateChildProfileInput", updateChildProfileSchema);
  registry.register("ChildResponse", response);
  registry.registerPath({
    method: "get",
    path: "/api/v1/children",
    operationId: "listChildren",
    tags: ["Діти"],
    security: [{ BearerAuth: [] }],
    responses: {
      [HTTP_STATUS.OK]: { description: "Доступна сторінка профілів дітей." },
    },
  });
  registry.registerPath({
    method: "post",
    path: "/api/v1/children",
    operationId: "createChildApplicant",
    tags: ["Діти"],
    security: [{ BearerAuth: [] }],
    request: {
      body: {
        required: true,
        content: { "application/json": { schema: createChildSchema } },
      },
    },
    responses: {
      [HTTP_STATUS.CREATED]: jsonResponse(
        response,
        "Заявника створено без зарахування чи місця.",
      ),
      [HTTP_STATUS.BAD_REQUEST]: { $ref: "#/components/responses/BadRequest" },
      [HTTP_STATUS.FORBIDDEN]: { description: "Недостатньо прав." },
    },
  });
  registry.registerPath({
    method: "get",
    path: "/api/v1/children/{id}",
    operationId: "getChild",
    tags: ["Діти"],
    security: [{ BearerAuth: [] }],
    request: { params: childId },
    responses: {
      [HTTP_STATUS.OK]: jsonResponse(
        response,
        "Профіль у дозволеній області доступу.",
      ),
      [HTTP_STATUS.NOT_FOUND]: { $ref: "#/components/responses/NotFound" },
    },
  });
  registry.registerPath({
    method: "patch",
    path: "/api/v1/children/{id}",
    operationId: "updateChildProfile",
    tags: ["Діти"],
    security: [{ BearerAuth: [] }],
    request: {
      params: childId,
      body: {
        required: true,
        content: { "application/json": { schema: updateChildProfileSchema } },
      },
    },
    responses: {
      [HTTP_STATUS.OK]: jsonResponse(
        response,
        "Дозволені поля профілю оновлено й записано аудит.",
      ),
      [HTTP_STATUS.BAD_REQUEST]: { $ref: "#/components/responses/BadRequest" },
      [HTTP_STATUS.FORBIDDEN]: {
        description: "Недостатньо прав або заборонене поле.",
      },
      [HTTP_STATUS.NOT_FOUND]: { $ref: "#/components/responses/NotFound" },
    },
  });
}
