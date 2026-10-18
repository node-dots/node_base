import test from "node:test";
import assert from "node:assert/strict";
import { InMemorySpanExporter } from "@opentelemetry/sdk-trace-node";
import { startTelemetry } from "../src/telemetry/telemetry.js";
import { readTelemetryConfig } from "../src/config/telemetry.js";
import {
  configureTraceDebugData,
  recordTraceDebugData,
} from "../src/telemetry/traceDebugData.js";
import { createTestApp as createApp } from "./helpers/app.js";

test("Dev-трейс показує дані, маскує секрети й вимикає дані в production", async () => {
  const config = readTelemetryConfig({
    TELEMETRY_ENABLED: "true",
    TELEMETRY_DEBUG_DATA: "true",
  });
  const exporter = new InMemorySpanExporter();
  const telemetry = startTelemetry({ config, exporter });
  const server = createApp().listen(0, "127.0.0.1");
  await new Promise((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  const url = `http://127.0.0.1:${server.address().port}/api/v1/groups`;
  const input = { name: "Веселка", ageCategory: 4, capacity: 20 };
  const post = (body) =>
    fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  try {
    const created = await post(input);
    assert.equal(created.status, 201);
    const group = (await created.json()).data;
    const rejected = await post({
      ...input,
      nested: { password: "secret-marker", accessToken: "secret-marker" },
    });
    assert.equal(rejected.status, 400);
    await rejected.json();
    await telemetry.forceFlush();
    const spans = exporter.getFinishedSpans();
    const createdSpans = spans.filter(
      (span) =>
        span.spanContext().traceId === created.headers.get("x-trace-id"),
    );
    const root = createdSpans.find(
      (span) => span.name === "POST /api/v1/groups",
    );
    assert.deepEqual(
      JSON.parse(root.attributes["app.debug.request"]).body,
      input,
    );
    assert.equal(createdSpans.length, 1);
    assert.deepEqual(JSON.parse(root.attributes["app.debug.response"]), {
      data: group,
    });
    const invalid = spans.find(
      (span) =>
        span.spanContext().traceId === rejected.headers.get("x-trace-id"),
    );
    assert.deepEqual(
      JSON.parse(invalid.attributes["app.debug.request"]).body.nested,
      {
        password: "[REDACTED]",
        accessToken: "[REDACTED]",
      },
    );
    assert.ok(
      !JSON.stringify(spans.map((span) => span.attributes)).includes(
        "secret-marker",
      ),
    );

    // Навіть явний debug-прапорець не дозволяє показ даних у production.
    configureTraceDebugData({ ...config, NODE_ENV: "production" });
    const production = await post(input);
    await production.json();
    await telemetry.forceFlush();
    const productionSpans = exporter
      .getFinishedSpans()
      .filter(
        (span) =>
          span.spanContext().traceId === production.headers.get("x-trace-id"),
      );
    assert.equal(productionSpans.length, 1);
    assert.ok(
      productionSpans.every(
        (span) =>
          !Object.keys(span.attributes).some((key) =>
            key.startsWith("app.debug."),
          ),
      ),
    );
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await telemetry.shutdown();
    configureTraceDebugData({});
  }
});

test("Dev-дані обмежені за обсягом і залишаються валідним JSON", () => {
  configureTraceDebugData({
    TELEMETRY_ENABLED: true,
    TELEMETRY_DEBUG_DATA: true,
    NODE_ENV: "development",
  });
  const attributes = {};
  const span = {
    isRecording: () => true,
    setAttribute: (key, value) => {
      attributes[key] = value;
    },
  };
  try {
    recordTraceDebugData(
      span,
      "input",
      Array.from({ length: 100 }, () => "x".repeat(5000)),
    );
    assert.ok(attributes.input.length <= 8000);
    assert.equal(JSON.parse(attributes.input).truncated, true);
    recordTraceDebugData(
      span,
      "escaped",
      Array.from({ length: 100 }, () => "\\".repeat(5000)),
    );
    assert.ok(attributes.escaped.length <= 8000);
    assert.equal(JSON.parse(attributes.escaped).truncated, true);
    const circular = {};
    circular.next = circular;
    recordTraceDebugData(span, "circular", circular);
    assert.ok(attributes.circular.includes("[DEPTH_LIMIT]"));
  } finally {
    configureTraceDebugData({});
  }
});
