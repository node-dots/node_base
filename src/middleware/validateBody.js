import { AppError } from '../utils/errors.js';
import { HTTP_STATUS, HTTP_ERROR_CODES } from '../utils/httpConstants.js';

// Валідація — перевірка body запиту за схемою Zod.
export function validateBody(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      return next(
        new AppError(
          HTTP_STATUS.BAD_REQUEST,
          HTTP_ERROR_CODES.VALIDATION_ERROR,
          'Некоректні дані запиту',
          result.error.issues.map((issue) => ({
            field: issue.path.join('.'),
            message: issue.message,
          })),
        ),
      );
    }
    req.validatedBody = result.data;
    next();
  };
}
