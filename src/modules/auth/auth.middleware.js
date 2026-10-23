import { AppError } from "../../utils/errors.js";
import { AUTH_ERROR_CODES, AUTH_ERROR_MESSAGES } from "./auth.constants.js";

function authenticationError() {
  return new AppError(
    401,
    AUTH_ERROR_CODES.AUTHENTICATION_REQUIRED,
    AUTH_ERROR_MESSAGES.AUTHENTICATION_REQUIRED,
  );
}

export function createAuthenticationMiddleware({ authService }) {
  return async function authenticate(request, response, next) {
    const header = request.get("authorization");
    const match =
      typeof header === "string" && /^Bearer ([^\s]+)$/i.exec(header);
    if (!match) return next(authenticationError());

    try {
      request.actor = await authService.authenticate(match[1]);
      return next();
    } catch (error) {
      return next(error);
    }
  };
}
