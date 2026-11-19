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
  const baseUrl = `http://127.0.0.1:${server.address().port}/api/v1/payments/000000000000000000000010`;
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

test("refund endpoint is ADMIN-only, validates payload and exposes payer-free history", async () => {
  const calls = [];
  const paymentId = "000000000000000000000010";
  const apiRouter = Router();
  apiRouter.use(
    "/payments",
    createPaymentRoutes({
      authService: {
        async authenticate(token) {
          return {
            id: `actor-${token}`,
            roles:
              token === "admin"
                ? ["ADMIN"]
                : token === "parent"
                  ? ["PARENT"]
                  : ["MANAGER"],
          };
        },
      },
      service: {
        async refund(...args) {
          calls.push(["refund", ...args]);
          return {
            id: "refund-1",
            paymentId,
            amountCents: args[1].amountCents,
            status: "CONFIRMED",
          };
        },
        async listRefunds(...args) {
          calls.push(["listRefunds", ...args]);
          return [
            {
              id: "refund-1",
              paymentId,
              amountCents: 100,
              status: "CONFIRMED",
            },
          ];
        },
      },
    }),
  );
  const server = createApp({ apiRouter }).listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}/api/v1/payments/${paymentId}`;
  const headers = (token) => ({
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  });
  try {
    const body = {
      amountCents: 100,
      reason: "Refund after withdrawal",
      idempotencyKey: "refund-http-0001",
    };
    const manager = await fetch(`${baseUrl}/refund`, {
      method: "POST",
      headers: headers("manager"),
      body: JSON.stringify(body),
    });
    assert.equal(manager.status, HTTP_STATUS.FORBIDDEN);
    assert.equal(calls.length, 0);

    const invalid = await fetch(`${baseUrl}/refund`, {
      method: "POST",
      headers: headers("admin"),
      body: JSON.stringify({ ...body, amountCents: 0 }),
    });
    assert.equal(invalid.status, HTTP_STATUS.BAD_REQUEST);
    assert.equal(calls.length, 0);

    const created = await fetch(`${baseUrl}/refund`, {
      method: "POST",
      headers: headers("admin"),
      body: JSON.stringify(body),
    });
    assert.equal(created.status, HTTP_STATUS.CREATED);
    assert.equal((await created.json()).data.status, "CONFIRMED");
    assert.equal(calls[0][0], "refund");

    const history = await fetch(`${baseUrl}/refunds`, {
      headers: headers("parent"),
    });
    assert.equal(history.status, HTTP_STATUS.OK);
    const data = (await history.json()).data;
    assert.equal(data.length, 1);
    assert.equal(Object.hasOwn(data[0], "payerPersonId"), false);
    assert.equal(calls[1][0], "listRefunds");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
