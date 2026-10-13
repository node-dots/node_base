import test from 'node:test';
import assert from 'node:assert/strict';
import { createTestApp as createApp } from './helpers/app.js';
import { createHttpServer } from '../src/utils/createHttpServer.js';
import { InMemoryGroupRepository } from './helpers/groupRepository.js';
import { readSecurityConfig } from '../src/config/security.js';
import { readServerConfig } from '../src/config/server.js';
import { HTTP_STATUS, HTTP_ERROR_CODES } from '../src/utils/httpConstants.js';

// Кожен тест отримує окремий застосунок і сховище, без спільних лічильників.
async function withServer({ settings = {}, repository = new InMemoryGroupRepository() }, run) {
  const securityConfig = readSecurityConfig(settings);
  const app = createApp({ groupRepository: repository, securityConfig });
  const server = createHttpServer({ app, securityConfig });
  server.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });

  try {
    await run({ baseUrl: `http://127.0.0.1:${server.address().port}`, repository, server });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test('Загальний ліміт повертає 429, requestId і час повторної спроби', async () => {
  await withServer({ settings: { RATE_LIMIT_REQUESTS: 2 } }, async ({ baseUrl }) => {
    assert.equal((await fetch(`${baseUrl}/health/live`)).status, HTTP_STATUS.OK);
    assert.equal((await fetch(`${baseUrl}/api/v1/groups`)).status, HTTP_STATUS.OK);
    const response = await fetch(`${baseUrl}/api/v1/groups`);
    const result = await response.json();
    assert.equal(response.status, HTTP_STATUS.TOO_MANY_REQUESTS);
    assert.equal(result.error.code, HTTP_ERROR_CODES.RATE_LIMIT_EXCEEDED);
    assert.equal(result.error.requestId, response.headers.get('x-request-id'));
    assert.ok(Number(response.headers.get('retry-after')) > 0);
    assert.ok(response.headers.get('ratelimit'));
  });
});

test('Ліміт запису не створює зайву групу та не блокує читання', async () => {
  await withServer(
    { settings: { WRITE_RATE_LIMIT_REQUESTS: 1 } },
    async ({ baseUrl, repository }) => {
      const options = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Сонечка', ageCategory: 2, capacity: 20 }),
      };
      assert.equal((await fetch(`${baseUrl}/api/v1/groups`, options)).status, HTTP_STATUS.CREATED);
      const blocked = await fetch(`${baseUrl}/api/v1/groups`, options);
      assert.equal(blocked.status, HTTP_STATUS.TOO_MANY_REQUESTS);
      assert.equal((await blocked.json()).error.code, HTTP_ERROR_CODES.WRITE_RATE_LIMIT_EXCEEDED);
      assert.equal((await repository.findAll()).length, 1);
      assert.equal((await fetch(`${baseUrl}/api/v1/groups`)).status, HTTP_STATUS.OK);
    },
  );
});

test('Підроблений X-Forwarded-For не обходить ліміт прямого локального сервера', async () => {
  await withServer({ settings: { RATE_LIMIT_REQUESTS: 1 } }, async ({ baseUrl }) => {
    const first = await fetch(`${baseUrl}/api/v1`, { headers: { 'X-Forwarded-For': '192.0.2.1' } });
    const second = await fetch(`${baseUrl}/api/v1`, {
      headers: { 'X-Forwarded-For': '192.0.2.2' },
    });
    assert.equal(first.status, HTTP_STATUS.OK);
    assert.equal(second.status, HTTP_STATUS.TOO_MANY_REQUESTS);
  });
});

test('Rate limit працює до JSON-парсера; Helmet встановлює захисні заголовки', async () => {
  await withServer({ settings: { RATE_LIMIT_REQUESTS: 1 } }, async ({ baseUrl }) => {
    const first = await fetch(`${baseUrl}/api/v1`);
    assert.equal(first.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(first.headers.get('x-powered-by'), null);
    assert.ok(first.headers.get('content-security-policy'));
    assert.equal(first.headers.get('strict-transport-security'), null);
    const blocked = await fetch(`${baseUrl}/api/v1/groups`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{',
    });
    assert.equal(blocked.status, HTTP_STATUS.TOO_MANY_REQUESTS);
    assert.equal((await blocked.json()).error.code, HTTP_ERROR_CODES.RATE_LIMIT_EXCEEDED);
  });
});

test('Неприпустимі значення конфігурації не вимикають захист', () => {
  assert.throws(() => readSecurityConfig({ RATE_LIMIT_REQUESTS: 0 }));
  assert.throws(() => readSecurityConfig({ RATE_LIMIT_WINDOW_MS: 'не число' }));
  assert.throws(() =>
    readSecurityConfig({ HEADERS_TIMEOUT_MS: 40_000, REQUEST_TIMEOUT_MS: 10_000 }),
  );
  for (const PORT of ['0', '65536', '3.5', 'invalid', '']) {
    assert.throws(() => readServerConfig({ PORT }));
  }
  assert.deepEqual(readServerConfig({}), { PORT: 3000, HOST: '127.0.0.1' });
});

test('HTTP-сервер використовує задані тайм-аути', () => {
  const securityConfig = readSecurityConfig({});
  const server = createHttpServer({ app: () => {}, securityConfig });
  assert.equal(server.headersTimeout, securityConfig.HEADERS_TIMEOUT_MS);
  assert.equal(server.requestTimeout, securityConfig.REQUEST_TIMEOUT_MS);
  assert.equal(server.keepAliveTimeout, securityConfig.KEEP_ALIVE_TIMEOUT_MS);
  assert.equal(server.timeout, securityConfig.SOCKET_IDLE_TIMEOUT_MS);
});
