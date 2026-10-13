import { traceHttpRequests } from './middleware/tracing.js';
import { HTTP_STATUS, HTTP_ERROR_CODES, READINESS_STATUS } from './utils/httpConstants.js';
import express from 'express';
import packageInfo from '../package.json' with { type: 'json' };
import { requestContext } from './middleware/requestContext.js';
import { AppError } from './utils/errors.js';
import { errorHandler } from './middleware/errorHandler.js';
import { readSecurityConfig } from './config/security.js';
import { createSecurityMiddleware } from './middleware/security.js';
import { makeApiDocumentationRoutes } from './middleware/apiDocumentation.js';

// Фабрика застосунку: збирає маршрути, але не відкриває мережевий порт.
export function createApp({
  apiRouter,
  securityConfig = readSecurityConfig(),
  isStorageReady = async () => false,
}) {
  const app = express();
  const security = createSecurityMiddleware(securityConfig);
  app.disable('x-powered-by');
  app.set('trust proxy', false); // Прямий локальний запуск, без довіреного проксі.

  app.use(requestContext);
  app.use(traceHttpRequests);
  app.use(security.headers);
  app.use(security.apiRateLimiter); // Усі адреси, включно з невідомими та health.
  app.use('/api/v1', security.limitWrites);
  // Ліміти стоять перед парсером: заблоковане тіло не потрібно розбирати.
  app.use(express.json({ limit: securityConfig.JSON_BODY_LIMIT_BYTES }));

  app.get('/health/live', (req, res) => {
    res.json({ data: { status: 'OK', service: 'kindergarten-backend', storage: 'MONGODB' } });
    // Liveness перевіряє процес, а не доступність БД.
  });

  app.get('/health/ready', async (req, res) => {
    let ready = false;
    try {
      ready = (await isStorageReady()) === true;
    } catch {
      // Технічна помилка перевірки означає неготовність, без секретів у відповіді.
    }
    res.status(ready ? HTTP_STATUS.OK : HTTP_STATUS.SERVICE_UNAVAILABLE).json({
      data: {
        status: ready ? READINESS_STATUS.READY : READINESS_STATUS.NOT_READY,
        storage: 'MONGODB',
      },
    });
  });

  app.get('/api/v1', (req, res) => {
    res.json({
      data: {
        name: 'Backend дитячого садка',
        version: packageInfo.version,
        documentation: '/api-docs/',
        openapi: '/api/v1/openapi.json',
      },
    });
  });

  app.use(makeApiDocumentationRoutes());
  app.use('/api/v1', apiRouter);
  app.use((req, res, next) =>
    next(
      new AppError(HTTP_STATUS.NOT_FOUND, HTTP_ERROR_CODES.ROUTE_NOT_FOUND, 'Маршрут не знайдено'),
    ),
  );
  app.use(errorHandler);
  return app;
}
