import { AppError } from "../utils/errors.js";
import { HTTP_STATUS, HTTP_ERROR_CODES } from "../utils/httpConstants.js";

// Перевіряє query-параметри та зберігає результат окремо від сирого запиту.
export function validateQuery(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.query);

    if (!result.success) {
      return next(
        new AppError(
          HTTP_STATUS.BAD_REQUEST,
          HTTP_ERROR_CODES.VALIDATION_ERROR,
          "Некоректні параметри запиту",
          result.error.issues.map((issuer) => ({
            field: issuer.path.join("."),
            message: issuer.message,
          })),
        ),
      );
    }
    req.validatedQuery = result.data;
    next();
  };
}
