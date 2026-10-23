import { jsonResponse } from "../../openapi/common.js";
import { HTTP_STATUS } from "../../utils/httpConstants.js";
import {
  employeeProfileSchema,
  updateEmployeeProfileSchema,
} from "./employee.schema.js";
import { z } from "../../openapi/zod.js";

const personParams = z.strictObject({ id: z.string().regex(/^[a-f\d]{24}$/i) });
const employeeResponse = z.object({
  data: z.object({
    id: z.string(),
    employee: z
      .object({
        positionCode: z.string(),
        status: z.string(),
        startedAt: z.string().optional(),
        endedAt: z.string().optional(),
        subjectCode: z.string().optional(),
        availability: z.array(z.unknown()),
        salaryMinor: z.number().optional(),
      })
      .optional(),
  }),
});

export function registerEmployeeDocumentation(registry) {
  registry.register("EmployeeProfileInput", employeeProfileSchema);
  registry.register("UpdateEmployeeProfileInput", updateEmployeeProfileSchema);
  registry.register("EmployeeProfileResponse", employeeResponse);
  registry.registerPath({
    method: "get",
    path: "/api/v1/people/{id}/employee",
    operationId: "getEmployeeProfile",
    tags: ["Облікові записи"],
    security: [{ BearerAuth: [] }],
    request: { params: personParams },
    responses: {
      [HTTP_STATUS.OK]: jsonResponse(
        employeeResponse,
        "Профіль працівника з полями відповідно до ролі.",
      ),
      [HTTP_STATUS.NOT_FOUND]: { $ref: "#/components/responses/NotFound" },
      [HTTP_STATUS.FORBIDDEN]: { description: "Недостатньо прав." },
    },
  });
  registry.registerPath({
    method: "put",
    path: "/api/v1/people/{id}/employee",
    operationId: "updateEmployeeProfile",
    tags: ["Облікові записи"],
    security: [{ BearerAuth: [] }],
    request: {
      params: personParams,
      body: {
        required: true,
        content: {
          "application/json": { schema: updateEmployeeProfileSchema },
        },
      },
    },
    responses: {
      [HTTP_STATUS.OK]: jsonResponse(
        employeeResponse,
        "Профіль оновлено атомарно з аудитом.",
      ),
      [HTTP_STATUS.BAD_REQUEST]: { $ref: "#/components/responses/BadRequest" },
      [HTTP_STATUS.FORBIDDEN]: {
        description: "Недостатньо прав або заборонене поле.",
      },
      [HTTP_STATUS.CONFLICT]: {
        description: "Працівник призначений до активної групи.",
      },
    },
  });
}
