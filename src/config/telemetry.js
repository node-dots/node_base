import { z as zod } from 'zod';

// Перша конфігурація експортує дані тільки в локальний OTLP/HTTP-приймач.
const telemetryEnvironmentSchema = zod.object({
  NODE_ENV: zod.enum(['development', 'test', 'production']).default('development'),
  TELEMETRY_DEBUG_DATA: zod
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  TELEMETRY_ENABLED: zod
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  OTEL_SERVICE_NAME: zod
    .string()
    .regex(/^[a-zA-Z0-9._-]{1,64}$/)
    .default('kindergarten-backend'),
  OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: zod
    .string()
    .url()
    .default('http://127.0.0.1:4318/v1/traces')
    .refine((value) => {
      let endpoint;
      try {
        endpoint = new URL(value);
      } catch {
        return false;
      }
      return (
        endpoint.protocol === 'http:' &&
        ['localhost', '127.0.0.1', '[::1]'].includes(endpoint.hostname) &&
        endpoint.pathname === '/v1/traces' &&
        !endpoint.username &&
        !endpoint.password &&
        !endpoint.search &&
        !endpoint.hash
      );
    }, 'Потрібен локальний HTTP endpoint /v1/traces без секретів і query-параметрів'),
});

export function readTelemetryConfig(environment = process.env) {
  const result = telemetryEnvironmentSchema.safeParse(environment);
  if (!result.success) {
    // У повідомленні тільки назви полів, без їх значень і всього environment.
    const fields = [...new Set(result.error.issues.map((issue) => issue.path.join('.')))];
    throw new Error(`Некоректні налаштування телеметрії: ${fields.join(', ')}`);
  }
  return Object.freeze(result.data);
}
