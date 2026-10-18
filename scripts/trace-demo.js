import { readTelemetryConfig } from "../src/config/telemetry.js";
import { HTTP_STATUS } from "../src/utils/httpConstants.js";

// Створюємо лише вигадану групу; параметри й тіла запитів не друкуємо.
const baseUrl = process.env.TRACE_DEMO_BASE_URL ?? "http://127.0.0.1:3100";
const parsedUrl = new URL(baseUrl);
if (
  !["127.0.0.1", "localhost", "[::1]"].includes(parsedUrl.hostname) ||
  parsedUrl.protocol !== "http:" ||
  parsedUrl.username ||
  parsedUrl.password ||
  parsedUrl.search ||
  parsedUrl.hash ||
  parsedUrl.pathname !== "/"
) {
  throw new Error(
    "TRACE_DEMO_BASE_URL має вказувати на локальний HTTP-сервер без додаткового шляху",
  );
}

async function request(path, expectedStatus, options) {
  const response = await fetch(new URL(path, baseUrl), {
    ...options,
    signal: AbortSignal.timeout(5000),
  });
  const result = await response.json();
  const traceId = response.headers.get("x-trace-id");
  console.log(
    JSON.stringify({
      operation: options?.method ?? "GET",
      status: response.status,
      traceId,
    }),
  );
  if (!traceId)
    throw new Error(
      "Trace ID відсутній: перевірте TELEMETRY_ENABLED і запуск нашого API",
    );
  if (response.status !== expectedStatus)
    throw new Error("Неочікуваний HTTP-статус демонстраційного запиту");
  return { response, result };
}

try {
  const created = await request("/api/v1/groups", HTTP_STATUS.CREATED, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "Демо телеметрії",
      ageCategory: 4,
      capacity: 20,
    }),
  });
  await request(`/api/v1/groups/${created.result.data.id}`, HTTP_STATUS.OK);
  await request("/api/v1/groups/telemetry-missing", HTTP_STATUS.NOT_FOUND); // Очікувана бізнес-відмова 404.
  await request("/api/v1/groups", HTTP_STATUS.BAD_REQUEST, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "Демо телеметрії",
      ageCategory: 4,
      capacity: 21,
    }),
  }); // Очікувана валідація 400, без виклику сценарію створення.
  console.log(
    `Jaeger: http://127.0.0.1:16686 · Service: ${readTelemetryConfig().OTEL_SERVICE_NAME}`,
  );
} catch {
  console.error(
    "Демонстрація не завершена. Перевірте локальний API, tracing і TRACE_DEMO_BASE_URL.",
  );
  process.exitCode = 1;
}
