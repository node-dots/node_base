import { startTelemetry } from "./telemetry/telemetry.js";
import { createApp } from "./app.js";
import { createApiRouter } from "./modules/index.js";
import { readServerConfig } from "./config/server.js";
import { readTelemetryConfig } from "./config/telemetry.js";
import { readSecurityConfig } from "./config/security.js";
import { createHttpServer } from "./utils/createHttpServer.js";
import { readAuthenticationConfig } from "./config/authentication.js";
import { createAuthModule } from "./modules/auth/auth.module.js";
import { createSecurityMiddleware } from "./middleware/security.js";

import {
  connectMongo,
  disconnectMongo,
  readDatabaseConfig,
  isMongoReady,
} from "./config/database.js";

const { PORT: port, HOST: host } = readServerConfig();
const securityConfig = readSecurityConfig();
const authenticationConfig = readAuthenticationConfig();
const loginRateLimiter =
  createSecurityMiddleware(securityConfig).loginRateLimiter;

const databaseConfig = readDatabaseConfig();
const telemetryConfig = readTelemetryConfig();
await connectMongo(databaseConfig.MONGO_URI);
console.log("Підключено до MongoDB");

const telemetry = startTelemetry({ config: telemetryConfig });

const authModule = createAuthModule({
  config: authenticationConfig,
  loginRateLimiter,
});
const apiRouter = createApiRouter({ authModule });
const app = createApp({
  apiRouter,
  securityConfig,
  isStorageReady: isMongoReady,
});
const server = createHttpServer({ app, securityConfig });

server.listen(port, host, () => {
  console.log(`Сервер запущено: http://${host}:${port}/api/v1`);
});
server.on("error", (error) => {
  console.error("Не вдалося запустити сервер:", error.code);
  shutdown(1);
});

async function closeResources() {
  try {
    await telemetry.shutdown();
  } finally {
    await disconnectMongo();
  }
}

// Коректне завершення по Ctrl+C або команді зупинки процесу.
let stopping = false;

function shutdown(exitCode = 0) {
  if (stopping) return;
  stopping = true;
  console.log("Зупиняємо сервер…");
  const deadline = setTimeout(
    () => process.exit(1),
    SECURITY_DEFAULTS.SHUTDOWN_TIMEOUT_MS,
  );
  deadline.unref();
  async function finish(error) {
    if (error) console.error(error.message);
    try {
      await closeResources();
    } catch {
      console.error("Не вдалося коректно закрити ресурси");
      exitCode = 1;
    } finally {
      clearTimeout(deadline);
      process.exitCode = error ? 1 : exitCode;
    }
  }

  if (server.listening) server.close(finish);
  else finish();
}

process.on("SIGINT", () => shutdown()); // SIGINT — переривання, наприклад Ctrl+C.
process.on("SIGTERM", () => shutdown()); // SIGTERM — запит завершення процесу.
