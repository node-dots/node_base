import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { AppError } from '../utils/errors.js';
import { HTTP_STATUS, HTTP_ERROR_CODES } from '../utils/httpConstants.js';
import { WRITE_METHODS, RATE_LIMIT_OPTIONS } from './securityConstants.js';

// Кожен екземпляр застосунку отримує власні лічильники в пам’яті.
function createLimiter({ windowMs, limit, identifier, requestPropertyName, errorCode, message }) {
  return rateLimit({
    windowMs,
    limit,
    identifier,
    requestPropertyName,
    standardHeaders: RATE_LIMIT_OPTIONS.HEADER_FORMAT,
    legacyHeaders: false,
    statusCode: HTTP_STATUS.TOO_MANY_REQUESTS,
    // Сервер працює напряму, trust proxy=false. Заголовок X-Forwarded-For
    // не визначає IP клієнта; не виводимо попередження для підробленого заголовка.
    validate: { xForwardedForHeader: false },
    // Залишаємо стандартний визначник IP бібліотеки, який також враховує IPv6.
    handler(request, response, next) {
      // RateLimit і Retry-After вже встановлені бібліотекою.
      next(new AppError(HTTP_STATUS.TOO_MANY_REQUESTS, errorCode, message));
    },
  });
}

export function createSecurityMiddleware(config) {
  const apiRateLimiter = createLimiter({
    windowMs: config.RATE_LIMIT_WINDOW_MS,
    limit: config.RATE_LIMIT_REQUESTS,
    identifier: RATE_LIMIT_OPTIONS.API_IDENTIFIER,
    requestPropertyName: RATE_LIMIT_OPTIONS.API_REQUEST_PROPERTY,
    errorCode: HTTP_ERROR_CODES.RATE_LIMIT_EXCEEDED,
    message: 'Забагато запитів. Повторіть спробу після зазначеного часу очікування',
  });

  const writeRateLimiter = createLimiter({
    windowMs: config.RATE_LIMIT_WINDOW_MS,
    limit: config.WRITE_RATE_LIMIT_REQUESTS,
    identifier: RATE_LIMIT_OPTIONS.WRITE_IDENTIFIER,
    requestPropertyName: RATE_LIMIT_OPTIONS.WRITE_REQUEST_PROPERTY,
    errorCode: HTTP_ERROR_CODES.WRITE_RATE_LIMIT_EXCEEDED,
    message: 'Перевищено ліміт операцій запису. Спробуйте пізніше',
  });

  return {
    headers: helmet({
      // Локальна розробка використовує HTTP, тому не примушуємо браузер до HTTPS.
      strictTransportSecurity: false,
      contentSecurityPolicy: { directives: { upgradeInsecureRequests: null } },
    }),
    apiRateLimiter,
    limitWrites(request, response, next) {
      if (WRITE_METHODS.includes(request.method)) {
        return writeRateLimiter(request, response, next);
      }
      return next();
    },
  };
}
