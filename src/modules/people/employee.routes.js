import { Router } from "express";
import { createAuthenticationMiddleware } from "../auth/auth.middleware.js";
import { validateBody } from "../../middleware/validateBody.js";
import { validateParams } from "../../middleware/validateParams.js";
import { validateQuery } from "../../middleware/validateQuery.js";
import { createRequirePermission } from "../../middleware/requirePermission.js";
import { authorizer } from "./access/authorizer.js";
import { PERMISSIONS } from "../../utils/access/permissions.js";
import { z } from "../../openapi/zod.js";
import { updateEmployeeProfileSchema } from "./employee.schema.js";

const paramsSchema = z.strictObject({ id: z.string().regex(/^[a-f\d]{24}$/i) });
const listQuerySchema = z.strictObject({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
});

export function createEmployeeRoutes({ employeeService, authService }) {
  const router = Router();
  const authenticate = createAuthenticationMiddleware({ authService });
  router.get(
    "/employees",
    authenticate,
    createRequirePermission({
      authorizer,
      permission: PERMISSIONS.PEOPLE_READ,
    }),
    validateQuery(listQuerySchema),
    async (request, response, next) => {
      try {
        response.json({
          data: await employeeService.list(
            request.validatedQuery,
            request.actor,
          ),
        });
      } catch (error) {
        next(error);
      }
    },
  );
  router.get(
    "/:id/employee",
    authenticate,
    validateParams(paramsSchema),
    async (request, response, next) => {
      try {
        response.json({
          data: await employeeService.get(
            request.validatedParams.id,
            request.actor,
          ),
        });
      } catch (error) {
        next(error);
      }
    },
  );
  router.put(
    "/:id/employee",
    authenticate,
    validateParams(paramsSchema),
    validateBody(updateEmployeeProfileSchema),
    async (request, response, next) => {
      try {
        response.json({
          data: await employeeService.update(
            request.validatedParams.id,
            request.validatedBody,
            request.actor,
            request.requestId,
          ),
        });
      } catch (error) {
        next(error);
      }
    },
  );
  return router;
}
