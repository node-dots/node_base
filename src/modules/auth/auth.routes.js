import { Router } from "express";
import { validateBody } from "../../middleware/validateBody.js";
import { createAuthenticationMiddleware } from "./auth.middleware.js";
import { changePasswordInputSchema, loginInputSchema } from "./auth.schema.js";

export function createAuthRoutes({
  authService,
  authController,
  loginRateLimiter,
}) {
  if (typeof loginRateLimiter !== "function") {
    throw new TypeError("loginRateLimiter is required");
  }
  const router = Router();
  const authenticate = createAuthenticationMiddleware({ authService });

  router.post(
    "/login",
    loginRateLimiter,
    validateBody(loginInputSchema),
    authController.login,
  );
  router.get("/me", authenticate, authController.currentActor);
  router.post(
    "/password",
    authenticate,
    validateBody(changePasswordInputSchema),
    authController.changePassword,
  );
  router.post("/logout-all", authenticate, authController.logoutAll);

  return router;
}
