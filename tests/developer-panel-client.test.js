import assert from "node:assert/strict";
import test from "node:test";
import {
  ApiClientError,
  DeveloperPanelApiClient,
} from "../docs/tools/developer-panel/api-client.js";

const finance = {
  month: "2026-11",
  accruedIncomeMinor: 100,
  receiptsNetMinor: 90,
  expensesMinor: 40,
  resultMinor: 60,
  cashFlowMinor: 50,
  currentOutstandingMinor: 10,
  currentOverdueMinor: 2,
  currentRefundDueMinor: 1,
  expenseBreakdown: [],
  asOf: "2026-11-09T12:00:00.000Z",
  notes: [],
};

function response(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

function successfulFetch(calls) {
  return async (input, init) => {
    const url = new URL(input);
    calls.push({ url, init });
    const path = `${url.pathname}${url.search}`;
    if (path === "/api/v1/auth/me")
      return response({ data: { id: "admin", roles: ["ADMIN"] } });
    if (path.startsWith("/api/v1/groups?"))
      return response({
        data: [],
        meta: { page: 1, pageSize: 100, total: 0, totalPages: 0 },
      });
    if (path.startsWith("/api/v1/children?"))
      return response({
        data: {
          children: [],
          pagination: { page: 1, pageSize: 100, total: 0, totalPages: 0 },
        },
      });
    if (path.startsWith("/api/v1/people/employees?"))
      return response({
        data: {
          employees: [],
          pagination: { page: 1, pageSize: 100, total: 0, totalPages: 0 },
        },
      });
    if (path.startsWith("/api/v1/invoices?"))
      return response({
        data: {
          invoices: [],
          pagination: { page: 1, pageSize: 100, total: 0, totalPages: 0 },
        },
      });
    if (path.startsWith("/api/v1/payments?"))
      return response({
        data: {
          payments: [],
          pagination: { page: 1, pageSize: 100, total: 0, totalPages: 0 },
        },
      });
    if (path.startsWith("/api/v1/expenses?"))
      return response({
        data: {
          expenses: [],
          pagination: { page: 1, pageSize: 100, total: 0, totalPages: 0 },
        },
      });
    if (path === "/api/v1/invoices/current-balances")
      return response({
        data: {
          currentOutstandingCents: 10,
          currentOverdueCents: 2,
          currentRefundDueCents: 1,
          asOf: finance.asOf,
          basis: "CURRENT_BALANCE_NOT_HISTORICAL",
        },
      });
    if (path === "/api/v1/reports/finance/monthly?month=2026-11")
      return response({ data: finance });
    if (path === "/api/v1/schedules/2026-11-09/published")
      return response({ error: { code: "PUBLISHED_SCHEDULE_NOT_FOUND" } }, 404);
    throw new Error(`Unexpected request: ${path}`);
  };
}

test("panel client calls only current protected GET contracts and keeps JWT private", async () => {
  const calls = [];
  const client = new DeveloperPanelApiClient({
    baseUrl: "http://localhost:3000/api/v1",
    token: "secret-jwt",
    fetchImpl: successfulFetch(calls),
  });
  const result = await client.loadDashboard({
    selectedMonth: "2026-11",
    weekStart: "2026-11-09",
  });
  assert.equal(result.mode, "api");
  assert.equal(result.finance.currentOutstandingMinor, 10);
  assert.equal(result.currentBalances.currentOutstandingCents, 10);
  assert.equal(result.schedule, null);
  assert.equal(JSON.stringify(client).includes("secret-jwt"), false);
  assert.ok(calls.length >= 10);
  assert.ok(calls.every(({ init }) => init.method === "GET"));
  assert.ok(
    calls.every(
      ({ init }) => init.headers.Authorization === "Bearer secret-jwt",
    ),
  );
  const paths = calls.map(({ url }) => `${url.pathname}${url.search}`);
  assert.ok(paths.some((path) => path.startsWith("/api/v1/people/employees?")));
  assert.ok(
    paths.some((path) => path.startsWith("/api/v1/invoices?month=2026-11")),
  );
  assert.ok(
    paths.some((path) => path.startsWith("/api/v1/payments?month=2026-11")),
  );
  assert.ok(
    paths.some((path) => path.startsWith("/api/v1/expenses?month=2026-11")),
  );
});

test("panel client reports 401 and 429 distinctly", async () => {
  for (const [status, kind, headers] of [
    [401, "unauthorized", {}],
    [429, "rate-limited", { "retry-after": "12" }],
  ]) {
    const client = new DeveloperPanelApiClient({
      baseUrl: "http://localhost:3000/api/v1",
      token: "jwt",
      fetchImpl: async () =>
        response({ error: { message: "no" } }, status, headers),
    });
    await assert.rejects(client.get("/auth/me"), (error) => {
      assert.ok(error instanceof ApiClientError);
      assert.equal(error.kind, kind);
      if (status === 429) assert.equal(error.retryAfter, "12");
      return true;
    });
  }
});

test("panel client distinguishes timeout and offline", async () => {
  const timeoutClient = new DeveloperPanelApiClient({
    baseUrl: "http://localhost:3000/api/v1",
    token: "jwt",
    timeoutMs: 5,
    fetchImpl: (_url, { signal }) =>
      new Promise((_resolve, reject) =>
        signal.addEventListener("abort", () =>
          reject(Object.assign(new Error("aborted"), { name: "AbortError" })),
        ),
      ),
  });
  await assert.rejects(timeoutClient.get("/auth/me"), { kind: "timeout" });
  const offlineClient = new DeveloperPanelApiClient({
    baseUrl: "http://localhost:3000/api/v1",
    token: "jwt",
    fetchImpl: async () => {
      throw new TypeError("network failed");
    },
  });
  await assert.rejects(offlineClient.get("/auth/me"), { kind: "offline" });
});

test("real API finance contract failure rejects instead of using demo values", async () => {
  const calls = [];
  const ok = successfulFetch(calls);
  const client = new DeveloperPanelApiClient({
    baseUrl: "http://localhost:3000/api/v1",
    token: "jwt",
    fetchImpl: async (url, init) => {
      if (String(url).includes("/reports/finance/monthly"))
        return response({ error: { message: "report unavailable" } }, 503);
      return ok(url, init);
    },
  });
  await assert.rejects(
    client.loadDashboard({ selectedMonth: "2026-11", weekStart: "2026-11-09" }),
    (error) => error.kind === "http" && error.status === 503,
  );
});

test("real API rejects obsolete finance field names", async () => {
  const calls = [];
  const ok = successfulFetch(calls);
  const client = new DeveloperPanelApiClient({
    baseUrl: "http://localhost:3000/api/v1",
    token: "jwt",
    fetchImpl: async (url, init) => {
      if (String(url).includes("/reports/finance/monthly")) {
        const invalid = { ...finance, outstandingMinor: 10 };
        delete invalid.currentOutstandingMinor;
        return response({ data: invalid });
      }
      return ok(url, init);
    },
  });
  await assert.rejects(
    client.loadDashboard({ selectedMonth: "2026-11", weekStart: "2026-11-09" }),
    { kind: "contract" },
  );
});
