import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { Router } from "express";
import { createApp } from "../src/app.js";
import { isMongoReady } from "../src/config/database.js";
import { readinessResponseSchema } from "../src/openapi/common.js";

const connected = mongoose.Connection.STATES.connected;

test("Readiness не виконує ping без відкритого з’єднання", async () => {
  let pingCalled = false;
  const connection = {
    readyState: mongoose.Connection.STATES.disconnected,
    db: {
      command() {
        pingCalled = true;
        throw new Error("Ping не повинен викликатися");
      },
    },
  };
  assert.equal(await isMongoReady(connection), false);
  assert.equal(pingCalled, false);
});

test("Readiness виконує ping з обмеженим часом очікування", async () => {
  const connection = {
    readyState: connected,
    db: {
      async command(command, options) {
        assert.deepEqual(command, { ping: 1 });
        assert.equal(options.timeoutMS, 2000);
        return { ok: 1 };
      },
    },
  };
  assert.equal(await isMongoReady(connection), true);
});

test("Readiness повертає false при помилці або неуспішному ping", async () => {
  assert.equal(
    await isMongoReady({
      readyState: connected,
      db: {
        async command() {
          throw new Error("MongoDB недоступна");
        },
      },
    }),
    false,
  );
  assert.equal(
    await isMongoReady({
      readyState: connected,
      db: {
        async command() {
          return { ok: 0 };
        },
      },
    }),
    false,
  );
});

test("HTTP-readiness відображає втрату й відновлення сховища, liveness залишається незалежним", async () => {
  let ready = false;
  let fail = false;
  const app = createApp({
    apiRouter: Router(),
    isStorageReady: async () => {
      if (fail)
        throw new Error("Секретний URI або stack не має потрапити у відповідь");
      return ready;
    },
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  const url = `http://127.0.0.1:${server.address().port}`;
  try {
    async function check(status, expected) {
      const response = await fetch(`${url}/health/ready`);
      assert.equal(response.status, status);
      const body = await response.json();
      readinessResponseSchema.parse(body);
      assert.deepEqual(body, {
        data: { status: expected, storage: "MONGODB" },
      });
      assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    }
    await check(503, "NOT_READY");
    assert.equal((await fetch(`${url}/health/live`)).status, 200);
    ready = true;
    await check(200, "READY");
    ready = false;
    await check(503, "NOT_READY");
    fail = true;
    await check(503, "NOT_READY");
    assert.equal((await fetch(`${url}/health/live`)).status, 200);
    fail = false;
    ready = true;
    await check(200, "READY");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
