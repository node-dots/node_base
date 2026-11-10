import assert from "node:assert/strict";
import { access, mkdir, readFile } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../docs/tools/developer-panel",
);
const candidates = [
  process.env.PANEL_BROWSER_EXECUTABLE,
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "/usr/bin/microsoft-edge",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
].filter(Boolean);
let executablePath;
for (const candidate of candidates) {
  try {
    await access(candidate);
    executablePath = candidate;
    break;
  } catch {}
}
if (!executablePath) {
  console.log("SKIP developer panel browser: Edge/Chrome executable not found");
  process.exit(0);
}

const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
};
const server = createServer(async (request, response) => {
  try {
    const pathname = new URL(request.url, "http://127.0.0.1").pathname;
    const relative = pathname === "/" ? "index.html" : pathname.slice(1);
    const filename = path.resolve(root, relative);
    if (!filename.startsWith(root)) throw new Error("invalid path");
    response.setHeader(
      "content-type",
      types[path.extname(filename)] ?? "text/plain",
    );
    response.setHeader("cache-control", "no-store");
    response.end(await readFile(filename));
  } catch {
    response.statusCode = 404;
    response.end("Not found");
  }
});
await new Promise((resolve) => server.listen(8088, "127.0.0.1", resolve));

const browser = await chromium.launch({ executablePath, headless: true });
const context = await browser.newContext();
const page = await context.newPage();
const methods = [];
const requestedEndpoints = [];
let delayFinance = false;
let releaseFinance;
const financeGate = () =>
  new Promise((resolve) => {
    releaseFinance = resolve;
  });
let pendingFinance;

function body(data) {
  return JSON.stringify({ data });
}
const report = {
  month: "2026-11",
  accruedIncomeMinor: 150000,
  receiptsNetMinor: 100000,
  expensesMinor: 60000,
  resultMinor: 90000,
  cashFlowMinor: 40000,
  currentOutstandingMinor: 50000,
  currentOverdueMinor: 0,
  currentRefundDueMinor: 0,
  asOf: "2026-11-09T12:00:00.000Z",
  expenseBreakdown: [],
  notes: ["BROWSER_VERIFIED"],
};

await page.route("**/api/v1/**", async (route) => {
  const request = route.request();
  methods.push(request.method());
  if (request.method() === "OPTIONS") {
    return route.fulfill({
      status: 204,
      headers: {
        "access-control-allow-origin": "http://127.0.0.1:8088",
        "access-control-allow-methods": "GET, OPTIONS",
        "access-control-allow-headers": "Authorization, Accept",
      },
    });
  }
  const auth = request.headers().authorization;
  if (auth === "Bearer bad-jwt") {
    return route.fulfill({
      status: 401,
      headers: { "access-control-allow-origin": "http://127.0.0.1:8088" },
      contentType: "application/json",
      body: JSON.stringify({ error: { code: "AUTHENTICATION_REQUIRED" } }),
    });
  }
  if (auth === "Bearer rate-jwt") {
    return route.fulfill({
      status: 429,
      headers: {
        "retry-after": "9",
        "access-control-allow-origin": "http://127.0.0.1:8088",
        "access-control-expose-headers": "Retry-After",
      },
      contentType: "application/json",
      body: JSON.stringify({ error: { code: "RATE_LIMITED" } }),
    });
  }
  if (auth === "Bearer timeout-jwt") {
    await new Promise(() => {});
  }
  const url = new URL(request.url());
  const endpoint = `${url.pathname}${url.search}`;
  requestedEndpoints.push(endpoint);
  const options = {
    status: 200,
    contentType: "application/json",
    headers: { "access-control-allow-origin": "http://127.0.0.1:8088" },
  };
  if (endpoint === "/api/v1/auth/me")
    options.body = body({ id: "admin", roles: ["ADMIN"] });
  else if (endpoint.startsWith("/api/v1/groups?"))
    options.body = JSON.stringify({
      data: [],
      meta: { page: 1, pageSize: 100, total: 0, totalPages: 0 },
    });
  else if (endpoint.startsWith("/api/v1/children?"))
    options.body = body({
      children: [],
      pagination: { page: 1, pageSize: 100, total: 0, totalPages: 0 },
    });
  else if (endpoint.startsWith("/api/v1/people/employees?"))
    options.body = body({
      employees: [],
      pagination: { page: 1, pageSize: 100, total: 0, totalPages: 0 },
    });
  else if (endpoint.startsWith("/api/v1/invoices?"))
    options.body = body({
      invoices: [],
      pagination: { page: 1, pageSize: 100, total: 0, totalPages: 0 },
    });
  else if (endpoint.startsWith("/api/v1/payments?"))
    options.body = body({
      payments: [],
      pagination: { page: 1, pageSize: 100, total: 0, totalPages: 0 },
    });
  else if (endpoint.startsWith("/api/v1/expenses?"))
    options.body = body({
      expenses: [],
      pagination: { page: 1, pageSize: 100, total: 0, totalPages: 0 },
    });
  else if (endpoint === "/api/v1/invoices/current-balances")
    options.body = body({
      currentOutstandingCents: 50000,
      currentOverdueCents: 0,
      currentRefundDueCents: 0,
      asOf: report.asOf,
      basis: "CURRENT_BALANCE_NOT_HISTORICAL",
    });
  else if (endpoint === "/api/v1/reports/finance/monthly?month=2026-11") {
    if (delayFinance) {
      pendingFinance ??= financeGate();
      await pendingFinance;
      pendingFinance = null;
    }
    options.body = body(report);
  } else if (endpoint === "/api/v1/schedules/2026-11-09/published") {
    options.status = 404;
    options.body = JSON.stringify({
      error: { code: "PUBLISHED_SCHEDULE_NOT_FOUND" },
    });
  } else {
    throw new Error(`Unexpected endpoint ${endpoint}`);
  }
  await route.fulfill(options);
});

try {
  await page.clock.install();
  await page.goto("http://127.0.0.1:8088", { waitUntil: "networkidle" });
  await page.locator("#month").fill("2026-11");
  await page.locator("#week").fill("2026-11-09");

  await page.getByTestId("demo-connect").click();
  await assert.doesNotReject(() =>
    page.getByTestId("mode").getByText("DEMO").waitFor(),
  );
  assert.equal(methods.length, 0);

  delayFinance = true;
  await page.locator("#jwt").fill("valid-jwt");
  await page.getByTestId("api-connect").click();
  await page.waitForTimeout(100);
  console.log(
    `Browser loading state: ${await page.getByTestId("status").textContent()}`,
  );
  console.log(`Browser requests: ${requestedEndpoints.join(", ")}`);
  await page
    .getByTestId("status")
    .getByText(/Завантаження/)
    .waitFor();
  releaseFinance();
  delayFinance = false;
  await page
    .getByTestId("status")
    .getByText(/API дані завантажено/)
    .waitFor();
  await page.getByTestId("mode").getByText("API").waitFor();
  assert.equal(await page.locator("#jwt").inputValue(), "");
  assert.deepEqual(
    await page.evaluate(() => [
      localStorage.length,
      sessionStorage.length,
      document.cookie,
    ]),
    [0, 0, ""],
  );
  assert.ok(
    methods.length >= 10 && methods.every((method) => method === "GET"),
  );
  await page.locator("#groups .empty").waitFor();

  await page.clock.fastForward(301_000);
  await page.getByTestId("stale").waitFor();

  const evidenceDir = path.resolve(root, "../../evidence");
  await mkdir(evidenceDir, { recursive: true });
  await page.screenshot({
    path: path.join(evidenceDir, "task-037-panel-browser.png"),
    fullPage: true,
  });

  await page.locator("#jwt").fill("bad-jwt");
  await page.getByTestId("api-connect").click();
  await page.getByTestId("status").getByText(/^401:/).waitFor();
  await page.getByTestId("dashboard").waitFor({ state: "hidden" });

  await page.locator("#jwt").fill("rate-jwt");
  await page.getByTestId("api-connect").click();
  await page
    .getByTestId("status")
    .getByText(/429:.*9/)
    .waitFor();

  await page.locator("#jwt").fill("timeout-jwt");
  await page.getByTestId("api-connect").click();
  await page.clock.fastForward(16_000);
  await page
    .getByTestId("status")
    .getByText(/^Timeout:/)
    .waitFor();

  await context.setOffline(true);
  await page.locator("#jwt").fill("valid-jwt");
  await page.getByTestId("api-connect").click();
  await page
    .getByTestId("status")
    .getByText(/^Offline:/)
    .waitFor();
  await context.setOffline(false);

  console.log(
    `Developer panel browser scenarios passed with ${methods.length} read-only API requests`,
  );
  console.log(
    `Evidence: ${path.join(evidenceDir, "task-037-panel-browser.png")}`,
  );
} finally {
  await context.close();
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
