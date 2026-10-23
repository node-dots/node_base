import { Router } from "express";
import { createAuthenticationMiddleware } from "../auth/auth.middleware.js";
import { validateBody } from "../../middleware/validateBody.js";
import { validateParams } from "../../middleware/validateParams.js";
import { z } from "../../openapi/zod.js";
import { updateEmployeeProfileSchema } from "./employee.schema.js";

const paramsSchema = z.strictObject({ id: z.string().regex(/^[a-f\d]{24}$/i) });

export function createEmployeeRoutes({ employeeService, authService }) {
  const router = Router();
  const authenticate = createAuthenticationMiddleware({ authService });
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
