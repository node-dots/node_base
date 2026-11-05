import { Router } from "express";
import { validateBody } from "../../middleware/validateBody.js";
import { validateQuery } from "../../middleware/validateQuery.js";
import { validateParams } from "../../middleware/validateParams.js";
import { createRequirePermission } from "../../middleware/requirePermission.js";
import { createAuthenticationMiddleware } from "../auth/auth.middleware.js";
import { PERMISSIONS } from "../../utils/access/permissions.js";
import { authorizer } from "../people/access/authorizer.js";
import { createChildSchema, updateChildProfileSchema } from "./child.schema.js";
import { CHILD_PAGINATION } from "./child.constants.js";
import { z as zod } from "../../openapi/zod.js";

const querySchema = zod.strictObject({
  page: zod.coerce.number().int().min(1).default(CHILD_PAGINATION.DEFAULT_PAGE),
  pageSize: zod.coerce
    .number()
    .int()
    .min(1)
    .max(CHILD_PAGINATION.MAX_PAGE_SIZE)
    .default(CHILD_PAGINATION.DEFAULT_PAGE_SIZE),
});

const membershipTargetSchema = zod.strictObject({
  groupId: zod.string().regex(/^[a-f\d]{24}$/i),
});
const childIdParamsSchema = zod.strictObject({
  id: zod.string().regex(/^[a-f\d]{24}$/i),
});

export function createChildRoutes({
  childService,
  membershipService,
  authService,
}) {
  if (!authService) throw new TypeError("authService is required for children");
  const router = Router();
  const authenticate = createAuthenticationMiddleware({ authService });
  const read = createRequirePermission({
    authorizer,
    permission: PERMISSIONS.CHILDREN_READ,
  });
  const create = createRequirePermission({
    authorizer,
    permission: PERMISSIONS.CHILDREN_CREATE,
  });
  const enroll = createRequirePermission({
    authorizer,
    permission: PERMISSIONS.CHILDREN_ENROLL,
  });
  const transfer = createRequirePermission({
    authorizer,
    permission: PERMISSIONS.CHILDREN_TRANSFER,
  });
  const membershipUpdate = createRequirePermission({
    authorizer,
    permission: PERMISSIONS.CHILDREN_UPDATE,
  });
  const update = (request, response, next) => {
    try {
      if (request.actor.roles.includes("PARENT"))
        authorizer.assertPermission(
          request.actor,
          PERMISSIONS.NUTRITION_UPDATE,
        );
      else
        authorizer.assertPermission(request.actor, PERMISSIONS.CHILDREN_UPDATE);
      next();
    } catch (error) {
      next(error);
    }
  };
  router.get(
    "/",
    authenticate,
    read,
    validateQuery(querySchema),
    async (request, response, next) => {
      try {
        response.json({
          data: await childService.list(request.validatedQuery, request.actor),
        });
      } catch (error) {
        next(error);
      }
    },
  );
  router.post(
    "/",
    authenticate,
    create,
    validateBody(createChildSchema),
    async (request, response, next) => {
      try {
        const child = await childService.createApplicant(
          request.validatedBody,
          request.actor,
          request.requestId,
        );
        response
          .location(`/api/v1/children/${child.id}`)
          .status(201)
          .json({ data: child });
      } catch (error) {
        next(error);
      }
    },
  );
  router.get("/:id", authenticate, read, async (request, response, next) => {
    try {
      response.json({
        data: await childService.get(request.params.id, request.actor),
      });
    } catch (error) {
      next(error);
    }
  });
  router.patch(
    "/:id",
    authenticate,
    update,
    validateBody(updateChildProfileSchema),
    async (request, response, next) => {
      try {
        response.json({
          data: await childService.update(
            request.params.id,
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
  router.post(
    "/:id/enroll",
    authenticate,
    enroll,
    validateParams(childIdParamsSchema),
    validateBody(membershipTargetSchema),
    async (request, response, next) => {
      try {
        const child = await membershipService.enroll(
          request.validatedParams.id,
          request.validatedBody.groupId,
          request.actor,
          request.requestId,
        );
        response.json({
          data: childService.viewPolicy.toReadDto(child, request.actor),
        });
      } catch (error) {
        next(error);
      }
    },
  );
  router.post(
    "/:id/transfer",
    authenticate,
    transfer,
    validateParams(childIdParamsSchema),
    validateBody(membershipTargetSchema),
    async (request, response, next) => {
      try {
        const child = await membershipService.transfer(
          request.validatedParams.id,
          request.validatedBody.groupId,
          request.actor,
          request.requestId,
        );
        response.json({
          data: childService.viewPolicy.toReadDto(child, request.actor),
        });
      } catch (error) {
        next(error);
      }
    },
  );
  router.post(
    "/:id/suspend",
    authenticate,
    membershipUpdate,
    validateParams(childIdParamsSchema),
    async (request, response, next) => {
      try {
        const child = await membershipService.suspend(
          request.validatedParams.id,
          request.actor,
          request.requestId,
        );
        response.json({
          data: childService.viewPolicy.toReadDto(child, request.actor),
        });
      } catch (error) {
        next(error);
      }
    },
  );
  router.post(
    "/:id/resume",
    authenticate,
    membershipUpdate,
    validateParams(childIdParamsSchema),
    async (request, response, next) => {
      try {
        const child = await membershipService.resume(
          request.validatedParams.id,
          request.actor,
          request.requestId,
        );
        response.json({
          data: childService.viewPolicy.toReadDto(child, request.actor),
        });
      } catch (error) {
        next(error);
      }
    },
  );
  return router;
}
