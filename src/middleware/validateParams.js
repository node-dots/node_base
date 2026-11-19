import { AppError } from "../utils/errors.js";
import { HTTP_ERROR_CODES, HTTP_STATUS } from "../utils/httpConstants.js";

export function validateParams(schema) {
  return (request, response, next) => {
    const result = schema.safeParse(request.params);
    if (!result.success) {
      return next(
        new AppError(
          HTTP_STATUS.BAD_REQUEST,
          HTTP_ERROR_CODES.VALIDATION_ERROR,
          "Некоректні параметри адреси",
          result.error.issues.map((issue) => ({
            field: issue.path.join("."),
            message: issue.message,
          })),
        ),
      );
    }
    request.validatedParams = result.data;
    return next();
  };
}
