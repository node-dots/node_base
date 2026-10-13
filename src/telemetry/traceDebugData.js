// Детальні дані дозволені тільки локально, коли їх явно ввімкнули.
let enabled = false;

export function configureTraceDebugData(config) {
  enabled =
    config.TELEMETRY_ENABLED && config.TELEMETRY_DEBUG_DATA && config.NODE_ENV === 'development';
}

const secretField =
  /password|passwd|token|secret|authorization|cookie|api[_-]?key|credential|session/i;

function sanitize(value, depth = 0) {
  if (depth > 6) return '[DEPTH_LIMIT]';
  if (typeof value === 'string')
    return value.length > 2000 ? `${value.slice(0, 2000)}[TRUNCATED]` : value;
  if (value === null || typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) return value.slice(0, 50).map((item) => sanitize(item, depth + 1));
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .slice(0, 50)
        .map(([key, item]) => [
          key,
          secretField.test(key) ? '[REDACTED]' : sanitize(item, depth + 1),
        ]),
    );
  }
  return '[UNSUPPORTED]';
}

export function recordTraceDebugData(span, attribute, value) {
  if (!enabled || !span?.isRecording() || value === undefined) return;
  try {
    const json = JSON.stringify(sanitize(value));
    span.setAttribute(
      attribute,
      json.length <= 8000
        ? json
        : JSON.stringify({ truncated: true, preview: json.slice(0, 3500) }),
    );
  } catch {
    // Проблема діагностики не повинна перервати бізнес-операцію.
    span.setAttribute(attribute, '[UNAVAILABLE]');
  }
}
