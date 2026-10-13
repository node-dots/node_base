import test from 'node:test';
import assert from 'node:assert/strict';
import { startTelemetry } from '../src/telemetry/telemetry.js';
import { readTelemetryConfig } from '../src/config/telemetry.js';
import { readSecurityConfig } from '../src/config/security.js';
import { createTestApp as createApp } from './helpers/app.js';
import { HTTP_STATUS } from '../src/utils/httpConstants.js';

test('Помилка експорту трейсів не змінює успішне створення групи', async () => {
  const failingExporter = {
    export(spans, callback) {
      callback({ code: 1, error: new Error('Collector unavailable') });
    },
    shutdown: async () => {},
  };
  const telemetry = startTelemetry({
    config: readTelemetryConfig({ TELEMETRY_ENABLED: 'true' }),
    exporter: failingExporter,
  });
  const server = createApp({ securityConfig: readSecurityConfig({}) }).listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  try {
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    const response = await fetch(`${baseUrl}/api/v1/groups`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Група без приймача', ageCategory: 3, capacity: 20 }),
    });
    assert.equal(response.status, HTTP_STATUS.CREATED);
    const group = (await response.json()).data;
    await assert.rejects(telemetry.forceFlush());
    const read = await fetch(`${baseUrl}/api/v1/groups/${group.id}`);
    assert.equal(read.status, HTTP_STATUS.OK);
    assert.deepEqual((await read.json()).data, group);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await telemetry.shutdown().catch(() => {});
  }
});
