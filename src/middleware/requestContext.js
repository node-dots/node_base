import { randomUUID } from "node:crypto";
import { getSafeRequestPath } from "./tracing.js";

// Ідентифікатор і технічний журнал спільні для всіх HTTP-запитів.
export function requestContext(request, response, next) {
  request.requestId = randomUUID();
  response.setHeader("X-Request-Id", request.requestId);
  const started = performance.now();

  response.once("finish", () => {
    console.log(
      JSON.stringify({
        requestId: request.requestId,
        ...(request.telemetryContext ?? {}),
        method: request.method,
        path: getSafeRequestPath(request),
        status: response.statusCode,
        durationMs: Math.round(performance.now() - started),
      }),
    );
  });

  next();
}
