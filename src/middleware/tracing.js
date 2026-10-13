import {
  context,
  propagation,
  trace,
  ROOT_CONTEXT,
  SpanKind,
  SpanStatusCode,
  isSpanContextValid,
} from '@opentelemetry/api';
import { HTTP_STATUS } from '../utils/httpConstants.js';
import { recordTraceDebugData } from '../telemetry/traceDebugData.js';

const excludedPaths = new Set(['/health/live', '/health/ready', '/api/v1/openapi.json']);

// Модулі монтуються на статичних префіксах. Router може скинути baseUrl
// при помилці, тому відновлюємо префікс без параметрів із суфікса route.path.
function getMatchedRoute(request) {
  const template = request.route?.path;
  if (typeof template !== 'string') return undefined;
  // Для wildcard/необов’язкових частин не відновлюємо префікс із даних клієнта.
  if (/[*{}]/.test(template)) return template;
  const path = (request.originalUrl ?? request.url).split('?')[0];
  const segments = path.split('/').filter(Boolean);
  const routeSegments = template.split('/').filter(Boolean);
  const prefix = segments.slice(0, segments.length - routeSegments.length);
  const route = `/${[...prefix, ...routeSegments].join('/')}`;
  return route;
}

// Логи також використовують шаблон маршруту, без ID, query чи невідомого шляху.
export function getSafeRequestPath(request) {
  const route = getMatchedRoute(request);
  if (route) return route;
  const path = (request.originalUrl ?? request.url).split('?')[0];
  if (excludedPaths.has(path)) return path;
  if (path === '/api-docs' || path.startsWith('/api-docs/')) return '/api-docs/*';
  return '(unmatched)';
}

export function traceHttpRequests(request, response, next) {
  if (
    excludedPaths.has(request.path) ||
    request.path === '/api-docs' ||
    request.path.startsWith('/api-docs/')
  ) {
    return next();
  }
  // Зовнішній baggage не приймаємо; тільки стандартний контекст W3C trace.
  const carrier = {
    traceparent: request.headers.traceparent,
    tracestate: request.headers.tracestate,
  };
  const parentContext = propagation.extract(ROOT_CONTEXT, carrier);
  const tracer = trace.getTracer('kindergarten-backend');
  const span = tracer.startSpan(
    `HTTP ${request.method}`,
    {
      kind: SpanKind.SERVER,
      attributes: {
        'http.request.method': request.method,
        'app.request_id': request.requestId,
      },
    },
    parentContext,
  );
  const spanContext = span.spanContext();
  if (isSpanContextValid(spanContext)) {
    request.telemetrySpan = span;
    request.telemetryContext = { traceId: spanContext.traceId, spanId: spanContext.spanId };
    response.setHeader('X-Trace-Id', spanContext.traceId);
  }
  // Спільне місце для всіх модулів; DTO та помилки проходять через res.json.
  const sendJson = response.json;
  response.json = function (body) {
    recordTraceDebugData(span, 'app.debug.response', body);
    return sendJson.call(this, body);
  };
  let ended = false;
  function finish(aborted) {
    if (ended) return;
    ended = true;
    const route = getMatchedRoute(request) ?? '(unmatched)';
    recordTraceDebugData(span, 'app.debug.request', {
      body: request.body,
      params: request.params,
      query: request.query,
    });
    span.updateName(`${request.method} ${route}`);
    span.setAttribute('http.route', route);
    span.setAttribute('http.response.status_code', response.statusCode);
    span.setAttribute(
      'app.request.outcome',
      aborted ? 'aborted' : response.statusCode >= HTTP_STATUS.BAD_REQUEST ? 'rejected' : 'success',
    );
    if (aborted || response.statusCode >= HTTP_STATUS.INTERNAL_SERVER_ERROR) {
      span.setStatus({ code: SpanStatusCode.ERROR });
    }
    span.end();
  }
  response.once('finish', () => finish(false));
  response.once('close', () => finish(!response.writableFinished));
  return context.with(trace.setSpan(parentContext, span), next);
}
