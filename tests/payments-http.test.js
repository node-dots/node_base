import test from "node:test";
import assert from "node:assert/strict";
import { Router } from "express";
import { createApp } from "../src/app.js";
import { createPaymentRoutes } from "../src/modules/payments/payment.routes.js";
import { HTTP_STATUS } from "../src/utils/httpConstants.js";

test("payment review endpoints require staff permission and validate confirmation", async () => {
  const calls = [];
  const apiRouter = Router();
  apiRouter.use(
    "/payments",
    createPaymentRoutes({
      authService: {
        async authenticate(token) {
          return {
            id: `actor-${token}`,
            roles: token === "parent" ? ["PARENT"] : ["MANAGER"],
          };
        },
      },
      service: {
        async confirm(...args) {
          calls.push(["confirm", ...args]);
          return { id: args[0], status: "CONFIRMED" };
        },
        async reject(...args) {
          calls.push(["reject", ...args]);
          return { id: args[0], status: "REJECTED" };
        },
      },
    }),
  );
  const server = createApp({ apiRouter }).listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}/api/v1/payments/payment-1`;
  const headers = (token) => ({
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  });
  try {
    const forbidden = await fetch(`${baseUrl}/confirm`, {
      method: "POST",
      headers: headers("parent"),
      body: JSON.stringify({ occurredAt: "2026-11-05T10:00:00Z" }),
    });
    assert.equal(forbidden.status, HTTP_STATUS.FORBIDDEN);
    assert.equal(calls.length, 0);

    const invalid = await fetch(`${baseUrl}/confirm`, {
      method: "POST",
      headers: headers("manager"),
      body: JSON.stringify({ occurredAt: "not-a-date" }),
    });
    assert.equal(invalid.status, HTTP_STATUS.BAD_REQUEST);
    assert.equal(calls.length, 0);

    const confirmed = await fetch(`${baseUrl}/confirm`, {
      method: "POST",
      headers: headers("manager"),
      body: JSON.stringify({ occurredAt: "2026-11-05T10:00:00Z" }),
    });
    assert.equal(confirmed.status, HTTP_STATUS.OK);
    assert.equal((await confirmed.json()).data.status, "CONFIRMED");
    assert.equal(calls[0][0], "confirm");

    const rejected = await fetch(`${baseUrl}/reject`, {
      method: "POST",
      headers: { Authorization: "Bearer manager" },
    });
    assert.equal(rejected.status, HTTP_STATUS.OK);
    assert.equal((await rejected.json()).data.status, "REJECTED");
    assert.equal(calls[1][0], "reject");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
