import test from "node:test";
import assert from "node:assert/strict";
import { InMemorySpanExporter } from "@opentelemetry/sdk-trace-node";
import { SpanKind } from "@opentelemetry/api";
import { startTelemetry } from "../src/telemetry/telemetry.js";
import { readTelemetryConfig } from "../src/config/telemetry.js";
import { readSecurityConfig } from "../src/config/security.js";
import { createTestApp as createApp } from "./helpers/app.js";
import { HTTP_STATUS } from "../src/utils/httpConstants.js";

test("Телеметрія вимкнена без налаштування та відхиляє нелокальний endpoint", () => {
  assert.equal(readTelemetryConfig({}).TELEMETRY_ENABLED, false);
  assert.equal(
    readTelemetryConfig({ TELEMETRY_ENABLED: "true" }).TELEMETRY_ENABLED,
    true,
  );
  assert.throws(() => readTelemetryConfig({ TELEMETRY_ENABLED: "1" }));
  for (const endpoint of [
    "bad-url",
    "https://example.com/v1/traces",
    "http://localhost:4318/v1/traces?secret=value",
  ]) {
    assert.throws(
      () =>
        readTelemetryConfig({ OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: endpoint }),
      {
        message:
          "Некоректні налаштування телеметрії: OTEL_EXPORTER_OTLP_TRACES_ENDPOINT",
      },
    );
  }
});

test("HTTP-трейси зберігають контекст і приватність без змін у модулях", async (testContext) => {
  const logRecords = [];
  testContext.mock.method(console, "log", (message) =>
    logRecords.push(JSON.parse(message)),
  );
  const exporter = new InMemorySpanExporter();
  const telemetry = startTelemetry({
    config: readTelemetryConfig({
      TELEMETRY_ENABLED: "true",
      OTEL_SERVICE_NAME: "telemetry-test",
    }),
    exporter,
  });
  const server = createApp({ securityConfig: readSecurityConfig({}) }).listen(
    0,
    "127.0.0.1",
  );
  await new Promise((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const secret = "private-telemetry-check-secret";
  const remoteTraceId = "11111111111111111111111111111111";
  const remoteSpanId = "2222222222222222";
  try {
    const created = await fetch(`${baseUrl}/api/v1/groups?token=${secret}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${secret}`,
        Cookie: `test=${secret}`,
        baggage: `private=${secret}`,
        traceparent: `00-${remoteTraceId}-${remoteSpanId}-01`,
      },
      body: JSON.stringify({ name: secret, ageCategory: 4, capacity: 20 }),
    });
    assert.equal(created.status, HTTP_STATUS.CREATED);
    assert.equal(created.headers.get("x-trace-id"), remoteTraceId);
    const group = (await created.json()).data;

    const [read, missing] = await Promise.all([
      fetch(`${baseUrl}/api/v1/groups/${group.id}`),
      fetch(`${baseUrl}/api/v1/groups/${secret}`),
    ]);
    assert.equal(read.status, HTTP_STATUS.OK);
    assert.deepEqual((await read.json()).data, group);
    assert.equal(missing.status, HTTP_STATUS.NOT_FOUND);
    await missing.json();
    assert.notEqual(
      read.headers.get("x-trace-id"),
      missing.headers.get("x-trace-id"),
    );

    const invalid = await fetch(`${baseUrl}/api/v1/groups`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: secret, ageCategory: 4, capacity: 21 }),
    });
    assert.equal(invalid.status, HTTP_STATUS.BAD_REQUEST);
    await invalid.json();
    const health = await fetch(`${baseUrl}/health/live`);
    assert.equal(health.headers.get("x-trace-id"), null);
    await health.json();

    await telemetry.forceFlush();
    const spans = exporter.getFinishedSpans();
    const createTrace = spans.filter(
      (span) => span.spanContext().traceId === remoteTraceId,
    );
    const root = createTrace.find((span) => span.kind === SpanKind.SERVER);
    assert.equal(createTrace.length, 1);
    assert.equal(root.name, "POST /api/v1/groups");
    assert.equal(root.parentSpanContext.spanId, remoteSpanId);
    assert.equal(
      root.attributes["app.request_id"],
      created.headers.get("x-request-id"),
    );

    const invalidTrace = spans.filter(
      (span) =>
        span.spanContext().traceId === invalid.headers.get("x-trace-id"),
    );
    assert.equal(invalidTrace.length, 1); // Валідація не викликає сценарій та репозиторій.
    assert.equal(
      invalidTrace[0].attributes["http.response.status_code"],
      HTTP_STATUS.BAD_REQUEST,
    );
    const missingTrace = spans.filter(
      (span) =>
        span.spanContext().traceId === missing.headers.get("x-trace-id"),
    );
    assert.equal(missingTrace.length, 1);
    assert.equal(
      missingTrace.find((span) => span.kind === SpanKind.SERVER).attributes[
        "app.error.code"
      ],
      "GROUP_NOT_FOUND",
    );
    assert.ok(
      spans.filter((span) => span.name === "GET /api/v1/groups/:id").length ===
        2,
    );
    const traceData = JSON.stringify(
      spans.map((span) => ({
        name: span.name,
        attributes: span.attributes,
        events: span.events,
        status: span.status,
        resource: span.resource.attributes,
      })),
    );
    assert.ok(!traceData.includes(secret));
    assert.ok(!traceData.includes(group.id));
    assert.ok(!JSON.stringify(logRecords).includes(secret));
    assert.ok(!JSON.stringify(logRecords).includes(group.id));
    assert.ok(
      logRecords.some(
        (record) =>
          record.traceId === remoteTraceId &&
          record.spanId === root.spanContext().spanId,
      ),
    );
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await telemetry.shutdown();
  }
});
