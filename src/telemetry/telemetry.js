import {
  NodeTracerProvider,
  BatchSpanProcessor,
  AlwaysOnSampler,
} from '@opentelemetry/sdk-trace-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { readTelemetryConfig } from '../config/telemetry.js';
import { configureTraceDebugData } from './traceDebugData.js';
import packageInfo from '../../package.json' with { type: 'json' };

// SDK підключаємо один раз під час запуску, а не в кожному контролері.
export function startTelemetry({ config = readTelemetryConfig(), exporter } = {}) {
  configureTraceDebugData(config);
  if (!config.TELEMETRY_ENABLED) {
    return { forceFlush: async () => {}, shutdown: async () => {} };
  }
  const traceExporter =
    exporter ??
    new OTLPTraceExporter({
      url: config.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT,
      timeoutMillis: 1000,
    });
  const provider = new NodeTracerProvider({
    resource: resourceFromAttributes({
      'service.name': config.OTEL_SERVICE_NAME,
      'service.version': packageInfo.version,
      'deployment.environment.name': config.NODE_ENV,
    }),
    sampler: new AlwaysOnSampler(), // Локально записуємо всі запити, що не виключені middleware.
    spanProcessors: [
      new BatchSpanProcessor(traceExporter, {
        scheduledDelayMillis: 1000,
        exportTimeoutMillis: 1500,
        maxQueueSize: 1024,
        maxExportBatchSize: 256,
      }),
    ],
  });
  provider.register(); // Контекст підтримує вкладені асинхронні виклики Node.js.
  return provider;
}
