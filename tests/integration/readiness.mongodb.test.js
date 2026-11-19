import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import mongoose from "mongoose";
import { Router } from "express";
import { createApp } from "../../src/app.js";
import { isMongoReady } from "../../src/config/database.js";

test(
  "MongoDB: readiness повертає 200, а після втрати з'єднання — 503",
  {
    skip: process.env.RUN_MONGO_TESTS !== "true",
  },
  async () => {
    const databaseName = `kindergarten_readiness_${randomUUID().replaceAll("-", "")}`;
    const connection = await mongoose
      .createConnection(
        "mongodb://127.0.0.1:27017/?replicaSet=rs0&directConnection=true",
        {
          dbName: databaseName,
          serverSelectionTimeoutMS: 5_000,
        },
      )
      .asPromise();
    const app = createApp({
      apiRouter: Router(),
      isStorageReady: () => isMongoReady(connection),
    });
    const server = app.listen(0, "127.0.0.1");
    await new Promise((resolve, reject) => {
      server.once("listening", resolve);
      server.once("error", reject);
    });
    const url = `http://127.0.0.1:${server.address().port}`;

    try {
      const readyResponse = await fetch(`${url}/health/ready`);
      assert.equal(readyResponse.status, 200);
      assert.deepEqual(await readyResponse.json(), {
        data: { status: "READY", storage: "MONGODB" },
      });

      await connection.dropDatabase();
      await connection.close();

      const unavailableResponse = await fetch(`${url}/health/ready`);
      assert.equal(unavailableResponse.status, 503);
      const unavailableBody = await unavailableResponse.text();
      assert.deepEqual(JSON.parse(unavailableBody), {
        data: { status: "NOT_READY", storage: "MONGODB" },
      });
      assert.doesNotMatch(unavailableBody, /mongodb:\/\/|stack/i);

      const liveResponse = await fetch(`${url}/health/live`);
      assert.equal(liveResponse.status, 200);
    } finally {
      if (connection.readyState !== mongoose.Connection.STATES.disconnected) {
        await connection.close();
      }
      await new Promise((resolve) => server.close(resolve));
    }
  },
);
