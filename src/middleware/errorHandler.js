import {
  AppError,
  BusinessError,
  ResourceNotFoundError,
} from "../utils/errors.js";
import {
  HTTP_STATUS,
  BODY_PARSER_ERROR_TYPES,
  HTTP_ERROR_CODES,
} from "../utils/httpConstants.js";

// Чотири аргументи потрібні Express для розпізнавання обробника помилок.
export function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);

  let known = error instanceof AppError ? error : null;
  if (error instanceof BusinessError) {
    known = new AppError(
      HTTP_STATUS.UNPROCESSABLE_ENTITY,
      error.code,
      error.message,
      error.details,
    );
  }
  if (error instanceof ResourceNotFoundError) {
    known = new AppError(HTTP_STATUS.NOT_FOUND, error.code, error.message);
  }
  if (error.type === BODY_PARSER_ERROR_TYPES.INVALID_JSON) {
    known = new AppError(
      HTTP_STATUS.BAD_REQUEST,
      HTTP_ERROR_CODES.INVALID_JSON,
      "Тіло запиту має містити коректний JSON",
    );
  }
  if (error.type === BODY_PARSER_ERROR_TYPES.BODY_TOO_LARGE) {
    known = new AppError(
      HTTP_STATUS.PAYLOAD_TOO_LARGE,
      HTTP_ERROR_CODES.BODY_TOO_LARGE,
      "Тіло запиту перевищує дозволений розмір",
    );
  }

  req.telemetrySpan?.setAttribute(
    "app.error.code",
    known?.code ?? HTTP_ERROR_CODES.INTERNAL_ERROR,
  );
  if (!known)
    console.error("Непередбачена помилка", { requestId: req.requestId, error });
  res.status(known?.status ?? HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
    error: {
      code: known?.code ?? HTTP_ERROR_CODES.INTERNAL_ERROR,
      message: known?.message ?? "Внутрішня помилка сервера",
      ...(known?.details ? { details: known.details } : {}),
      requestId: req.requestId,
    },
  });
}
