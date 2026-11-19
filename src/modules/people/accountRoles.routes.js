import { Router } from "express";
import { validateBody } from "../../middleware/validateBody.js";
import { validateParams } from "../../middleware/validateParams.js";
import { createAuthenticationMiddleware } from "../auth/auth.middleware.js";
import { createRequirePermission } from "../../middleware/requirePermission.js";
import { authorizer } from "./access/authorizer.js";
import { PERMISSIONS } from "../../utils/access/permissions.js";
import { assignAccountRolesSchema } from "./accountRoles.schema.js";
import { AccountRolesController } from "./accountRoles.controller.js";
import { z } from "../../openapi/zod.js";

const personIdParamsSchema = z
  .strictObject({
    id: z.string().regex(/^[a-f\d]{24}$/i),
  })
  .meta({ id: "PersonIdParams" });

export function createAccountRolesRoutes({ accountRolesService, authService }) {
  const router = Router();
  const controller = new AccountRolesController({ accountRolesService });
  router.put(
    "/:id/account/roles",
    createAuthenticationMiddleware({ authService }),
    createRequirePermission({
      authorizer,
      permission: PERMISSIONS.ROLES_ASSIGN,
    }),
    validateParams(personIdParamsSchema),
    validateBody(assignAccountRolesSchema),
    controller.assign,
  );
  return router;
}
