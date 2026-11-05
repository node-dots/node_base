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
  benefitAssignments: zod
    .array(
      zod.object({
        benefitCode: zod.string(),
        basisPoints: zod.number().int(),
        startMonth: zod.string(),
        endMonth: zod.string().optional(),
      }),
    )
    .optional(),
});
const response = zod.object({ data: childSummary });
const membershipTarget = zod.strictObject({
  groupId: zod.string().regex(/^[a-f\d]{24}$/i),
});

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
  for (const [suffix, method, operationId, permission] of [
    ["enroll", "post", "enrollChild", "children:enroll"],
    ["transfer", "post", "transferChild", "children:transfer"],
  ]) {
    registry.registerPath({
      method,
      path: `/api/v1/children/{id}/${suffix}`,
      operationId,
      tags: ["Діти"],
      security: [{ BearerAuth: [] }],
      description: `Requires ${permission}; group seat and child membership are changed in one transaction.`,
      request: {
        params: childId,
        body: {
          required: true,
          content: { "application/json": { schema: membershipTarget } },
        },
      },
      responses: {
        [HTTP_STATUS.OK]: jsonResponse(
          response,
          "Membership command completed.",
        ),
        [HTTP_STATUS.BAD_REQUEST]: {
          $ref: "#/components/responses/BadRequest",
        },
        [HTTP_STATUS.CONFLICT]: {
          description:
            "State, age, school year, capacity, or membership history conflict.",
        },
        [HTTP_STATUS.NOT_FOUND]: { $ref: "#/components/responses/NotFound" },
        [HTTP_STATUS.FORBIDDEN]: { description: "Insufficient permission." },
      },
    });
  }
  for (const [suffix, operationId] of [
    ["suspend", "suspendChild"],
    ["resume", "resumeChild"],
  ]) {
    registry.registerPath({
      method: "post",
      path: `/api/v1/children/{id}/${suffix}`,
      operationId,
      tags: ["Діти"],
      security: [{ BearerAuth: [] }],
      request: { params: childId },
      responses: {
        [HTTP_STATUS.OK]: jsonResponse(
          response,
          "Membership state changed atomically.",
        ),
        [HTTP_STATUS.CONFLICT]: { description: "Invalid child state." },
        [HTTP_STATUS.NOT_FOUND]: { $ref: "#/components/responses/NotFound" },
        [HTTP_STATUS.FORBIDDEN]: { description: "Insufficient permission." },
      },
    });
  }
  registry.registerPath({
    method: "post",
    path: "/api/v1/children/{id}/benefits",
    operationId: "assignChildBenefit",
    tags: ["Діти"],
    security: [{ BearerAuth: [] }],
    request: {
      params: childId,
      body: {
        required: true,
        content: {
          "application/json": {
            schema: zod.strictObject({
              benefitCode: zod.string(),
              startMonth: zod.string(),
              endMonth: zod.string().optional(),
            }),
          },
        },
      },
    },
    responses: {
      [HTTP_STATUS.OK]: jsonResponse(
        response,
        "Dated benefit assignment saved with a rate snapshot.",
      ),
      [HTTP_STATUS.CONFLICT]: {
        description: "Benefit dates overlap or history limit was reached.",
      },
      [HTTP_STATUS.FORBIDDEN]: { description: "Insufficient permission." },
    },
  });
}
