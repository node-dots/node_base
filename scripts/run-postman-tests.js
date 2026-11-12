import { spawn, spawnSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import net from "node:net";
import path from "node:path";

const root = process.cwd();
const resultsDirectory = path.join(root, "postman", "results");
const collectionPath = path.join(
  root,
  "postman",
  "Kindergarten_API.postman_collection.json",
);
const environmentPath = path.join(
  root,
  "postman",
  "Kindergarten_Local.postman_environment.json",
);
const databaseName = `kindergarten_test_${randomUUID().replaceAll("-", "")}`;
const adminEmail = `postman-admin-${randomUUID()}@example.test`;
const adminPassword = randomBytes(24).toString("base64url");
const parentPassword = randomBytes(24).toString("base64url");
let backend;
let exitCode = 1;

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    env: options.env ?? process.env,
    encoding: "utf8",
    stdio: options.capture ? "pipe" : "inherit",
    timeout: options.timeout ?? 240_000,
  });
  if (result.error || result.status !== 0) {
    if (options.capture) {
      if (result.stdout) process.stdout.write(result.stdout);
      if (result.stderr) process.stderr.write(result.stderr);
    }
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
      // Backend is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Backend did not become ready at ${url}`);
}

function stripAnsi(value) {
  return value.replace(/\u001b\[[0-9;]*m/g, "");
}

function readNewmanMetric(output, label) {
  const line = stripAnsi(output)
    .split(/\r?\n/)
    .find((candidate) =>
      new RegExp(`^\\s*[|│]\\s*${label}\\s*[|│]`, "i").test(candidate),
    );
  if (!line) return null;
  const numbers = line.match(/\d+/g)?.map(Number) ?? [];
  return numbers[0] ?? null;
}

async function cleanup() {
  if (backend && !backend.killed) {
    backend.kill("SIGTERM");
    await new Promise((resolve) => {
      const timer = setTimeout(resolve, 6000);
      backend.once("exit", () => {
        clearTimeout(timer);
        resolve();
      });
    });
    if (!backend.killed) backend.kill("SIGKILL");
  }
  if (/^kindergarten_test_[a-f\d]{32}$/i.test(databaseName)) {
    const dropScript = `db.getSiblingDB(${JSON.stringify(databaseName)}).dropDatabase()`;
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
        dropScript,
      ],
      { cwd: root, stdio: "ignore", timeout: 30_000 },
    );
  }
}

try {
  await mkdir(resultsDirectory, { recursive: true });
  run(process.execPath, ["scripts/generate-postman-collection.js"]);
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
    NODE_ENV: "test",
    HOST: "0.0.0.0",
    PORT: String(port),
    MONGO_URI: `mongodb://127.0.0.1:27017/${databaseName}?replicaSet=rs0&directConnection=true`,
    JWT_SECRET: randomBytes(48).toString("base64url"),
    JWT_ISSUER: `http://127.0.0.1:${port}`,
    JWT_AUDIENCE: "kindergarten-postman",
    BOOTSTRAP_ADMIN_EMAIL: adminEmail,
    BOOTSTRAP_ADMIN_PASSWORD: adminPassword,
    BOOTSTRAP_ADMIN_FIRST_NAME: "Postman",
    BOOTSTRAP_ADMIN_LAST_NAME: "Administrator",
    DEMO_PARENT_PASSWORD: parentPassword,
    SEED_DATABASE: databaseName,
    RATE_LIMIT_REQUESTS: "2000",
    WRITE_RATE_LIMIT_REQUESTS: "1000",
    LOGIN_RATE_LIMIT_REQUESTS: "10",
    TELEMETRY_ENABLED: "false",
  };

  run(process.execPath, ["scripts/bootstrap-admin.js"], {
    env: runtimeEnvironment,
  });
  run(process.execPath, ["scripts/seed.js"], {
    env: runtimeEnvironment,
    timeout: 300_000,
  });

  const backendLog = [];
  backend = spawn(process.execPath, ["src/server.js"], {
    cwd: root,
    env: runtimeEnvironment,
    stdio: ["ignore", "pipe", "pipe"],
  });
  backend.stdout.on("data", (chunk) => backendLog.push(chunk.toString()));
  backend.stderr.on("data", (chunk) => backendLog.push(chunk.toString()));
  await waitForReady(`http://127.0.0.1:${port}/health/ready`);

  const junitPath = path.join(resultsDirectory, "postman.junit.xml");
  const newman = run(
    "docker",
    [
      "run",
      "--rm",
      "--add-host",
      "host.docker.internal:host-gateway",
      "--mount",
      `type=bind,source=${collectionPath},target=/etc/newman/collection.json,readonly`,
      "--mount",
      `type=bind,source=${environmentPath},target=/etc/newman/environment.json,readonly`,
      "--mount",
      `type=bind,source=${resultsDirectory},target=/etc/newman/results`,
      "postman/newman:6-alpine",
      "run",
      "/etc/newman/collection.json",
      "--environment",
      "/etc/newman/environment.json",
      "--env-var",
      `baseUrl=http://host.docker.internal:${port}`,
      "--env-var",
      `adminEmail=${adminEmail}`,
      "--env-var",
      `adminPassword=${adminPassword}`,
      "--env-var",
      `parentPassword=${parentPassword}`,
      "--reporters",
      "cli,junit",
      "--reporter-junit-export",
      "/etc/newman/results/postman.junit.xml",
      "--color",
      "off",
      "--disable-unicode",
      "--timeout-request",
      "10000",
    ],
    { capture: true, timeout: 300_000 },
  );
  process.stdout.write(newman.stdout);
  if (newman.stderr) process.stderr.write(newman.stderr);

  const collection = JSON.parse(await readFile(collectionPath, "utf8"));
  const staticRequests = collection.item.reduce(
    (count, folder) => count + folder.item.length,
    0,
  );
  const junit = await readFile(junitPath, "utf8");
  if (/adminPassword|parentPassword|accessToken|Bearer\s+eyJ/i.test(junit))
    throw new Error("JUnit report unexpectedly contains a secret field");
  const summary = {
    generatedAt: new Date().toISOString(),
    runner: "postman/newman:6-alpine",
    collectionSchema: collection.info.schema,
    folders: collection.item.length,
    staticRequests,
    requestsExecuted: readNewmanMetric(newman.stdout, "requests"),
    assertions: readNewmanMetric(newman.stdout, "assertions"),
    failed: 0,
    skipped: 0,
    result: "PASSED",
    databaseIsolation:
      "random kindergarten_test_<uuid> database; dropped after run",
    junit: "postman/results/postman.junit.xml",
  };
  await writeFile(
    path.join(resultsDirectory, "postman-summary.json"),
    `${JSON.stringify(summary, null, 2)}\n`,
  );
  exitCode = 0;
} catch (error) {
  console.error(`Postman run failed: ${error.message}`);
} finally {
  await cleanup();
  process.exitCode = exitCode;
}
