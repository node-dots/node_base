import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { access, mkdir, readFile } from "node:fs/promises";
import { createServer } from "node:http";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const panelRoot = path.join(repositoryRoot, "docs", "tools", "developer-panel");
const databaseName = `kindergarten_test_${randomUUID().replaceAll("-", "")}`;
const adminEmail = `panel-admin-${randomUUID()}@example.test`;
const adminPassword = randomBytes(24).toString("base64url");
const parentPassword = randomBytes(24).toString("base64url");
let backend;
let staticServer;
let browser;

const browserCandidates = [
  process.env.PANEL_BROWSER_EXECUTABLE,
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "/usr/bin/microsoft-edge",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
].filter(Boolean);

function run(command, argumentsList, options = {}) {
  const result = spawnSync(command, argumentsList, {
    cwd: repositoryRoot,
    env: options.env ?? process.env,
    encoding: "utf8",
    stdio: options.capture ? "pipe" : "inherit",
    timeout: options.timeout ?? 240_000,
  });
  if (result.error || result.status !== 0) {
    throw result.error ?? new Error(`${command} exited with ${result.status}`);
  }
  return result;
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => resolve(address.port));
    });
  });
}

async function waitForReady(url, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // The backend is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Backend did not become ready at ${url}`);
}

function thisWeekMonday() {
  const result = new Date();
  const weekday = result.getUTCDay() || 7;
  result.setUTCDate(result.getUTCDate() - weekday + 1);
  return result.toISOString().slice(0, 10);
}

async function findBrowser() {
  for (const candidate of browserCandidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Try the next known system browser path.
    }
  }
  return null;
}

async function startStaticServer() {
  const contentTypes = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
  };
  staticServer = createServer(async (request, response) => {
    try {
      const pathname = new URL(request.url, "http://127.0.0.1").pathname;
      if (pathname === "/favicon.ico") {
        response.statusCode = 204;
        return response.end();
      }
      const relative = pathname === "/" ? "index.html" : pathname.slice(1);
      const filename = path.resolve(panelRoot, relative);
      if (!filename.startsWith(panelRoot)) throw new Error("invalid path");
      response.setHeader(
        "content-type",
        contentTypes[path.extname(filename)] ?? "text/plain",
      );
      response.setHeader("cache-control", "no-store");
      response.end(await readFile(filename));
    } catch {
      response.statusCode = 404;
      response.end("Not found");
    }
  });
  await new Promise((resolve, reject) => {
    staticServer.once("error", reject);
    staticServer.listen(8088, "127.0.0.1", resolve);
  });
}

async function stopChild(child) {
  if (!child || child.exitCode !== null) return;
  child.kill("SIGTERM");
  await new Promise((resolve) => {
    const timer = setTimeout(resolve, 6000);
    child.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
  });
  if (child.exitCode === null) child.kill("SIGKILL");
}

async function cleanup() {
  if (browser) await browser.close().catch(() => {});
  if (staticServer) {
    await new Promise((resolve) => staticServer.close(() => resolve()));
  }
  await stopChild(backend);
  if (/^kindergarten_test_[a-f\d]{32}$/i.test(databaseName)) {
    const script = `db.getSiblingDB(${JSON.stringify(databaseName)}).dropDatabase()`;
    spawnSync(
      "docker",
      [
        "compose",
        "exec",
        "-T",
        "mongodb",
        "mongosh",
        "--quiet",
        "--eval",
        script,
      ],
      { cwd: repositoryRoot, stdio: "ignore", timeout: 30_000 },
    );
  }
}

try {
  const executablePath = await findBrowser();
  if (!executablePath) {
    console.log(
      "SKIP real API panel browser: Edge/Chrome executable not found",
    );
    process.exit(0);
  }

  run("docker", [
    "compose",
    "up",
    "-d",
    "--wait",
    "--wait-timeout",
    "60",
    "mongodb",
  ]);
  run("docker", [
    "compose",
    "exec",
    "-T",
    "mongodb",
    "mongosh",
    "--quiet",
    "/scripts/mongodb-init.js",
  ]);

  const port = await freePort();
  const runtimeEnvironment = {
    ...process.env,
    NODE_ENV: "development",
    HOST: "127.0.0.1",
    PORT: String(port),
    MONGO_URI: `mongodb://127.0.0.1:27017/${databaseName}?replicaSet=rs0&directConnection=true`,
    JWT_SECRET: randomBytes(48).toString("base64url"),
    JWT_ISSUER: `http://127.0.0.1:${port}`,
    JWT_AUDIENCE: "kindergarten-panel-browser",
    BOOTSTRAP_ADMIN_EMAIL: adminEmail,
    BOOTSTRAP_ADMIN_PASSWORD: adminPassword,
    BOOTSTRAP_ADMIN_FIRST_NAME: "Panel",
    BOOTSTRAP_ADMIN_LAST_NAME: "Administrator",
    DEMO_PARENT_PASSWORD: parentPassword,
    SEED_DATABASE: databaseName,
    RATE_LIMIT_REQUESTS: "2000",
    WRITE_RATE_LIMIT_REQUESTS: "1000",
    LOGIN_RATE_LIMIT_REQUESTS: "100",
    TELEMETRY_ENABLED: "false",
  };

  run(process.execPath, ["scripts/bootstrap-admin.js"], {
    env: runtimeEnvironment,
  });
  run(process.execPath, ["scripts/seed.js"], {
    env: runtimeEnvironment,
    timeout: 300_000,
  });

  backend = spawn(process.execPath, ["src/server.js"], {
    cwd: repositoryRoot,
    env: runtimeEnvironment,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const backendOutput = [];
  backend.stdout.on("data", (chunk) => backendOutput.push(chunk.toString()));
  backend.stderr.on("data", (chunk) => backendOutput.push(chunk.toString()));
  await waitForReady(`http://127.0.0.1:${port}/health/ready`);

  const loginResponse = await fetch(
    `http://127.0.0.1:${port}/api/v1/auth/login`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: adminEmail, password: adminPassword }),
    },
  );
  assert.equal(loginResponse.status, 200);
  const login = await loginResponse.json();
  const accessToken = login.data?.accessToken;
  assert.equal(typeof accessToken, "string");

  await startStaticServer();
  browser = await chromium.launch({ executablePath, headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  const browserErrors = [];
  page.on("pageerror", (error) => browserErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push(message.text());
  });

  await page.goto("http://127.0.0.1:8088", { waitUntil: "networkidle" });
  await page.locator("#base-url").fill(`http://127.0.0.1:${port}/api/v1`);
  await page.locator("#jwt").fill(accessToken);
  await page.locator("#month").fill(new Date().toISOString().slice(0, 7));
  await page.locator("#week").fill(thisWeekMonday());
  await page.getByTestId("api-connect").click();
  await page
    .getByTestId("status")
    .getByText(/API дані завантажено/)
    .waitFor({
      timeout: 30_000,
    });
  await page.getByTestId("mode").getByText("API").waitFor();
  await page.getByTestId("dashboard").waitFor({ state: "visible" });

  assert.equal(await page.locator("#jwt").inputValue(), "");
  assert.deepEqual(
    await page.evaluate(() => [
      localStorage.length,
      sessionStorage.length,
      document.cookie,
    ]),
    [0, 0, ""],
  );
  for (const selector of [
    "#groups tbody tr",
    "#children tbody tr",
    "#employees tbody tr",
    "#invoices tbody tr",
    "#payments tbody tr",
    "#expenses tbody tr",
    "#schedule tbody tr",
  ]) {
    assert.ok(
      (await page.locator(selector).count()) > 0,
      `${selector} is empty`,
    );
  }
  const requestLog = await page.getByTestId("request-log").textContent();
  assert.match(requestLog, /GET \/auth\/me/);
  assert.match(requestLog, /GET \/reports\/finance\/monthly/);
  assert.doesNotMatch(requestLog, /Bearer|eyJ/);
  assert.deepEqual(browserErrors, []);

  const evidenceDirectory = path.join(repositoryRoot, "docs", "evidence");
  await mkdir(evidenceDirectory, { recursive: true });
  const screenshot = path.join(
    evidenceDirectory,
    "task-037-panel-real-api.png",
  );
  await page.screenshot({ path: screenshot, fullPage: true });
  await context.close();
  console.log(
    "Developer panel real API mode passed with ADMIN authentication and seeded MongoDB data",
  );
  console.log(`Evidence: ${screenshot}`);
} catch (error) {
  console.error(`Developer panel real API test failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  await cleanup();
}
