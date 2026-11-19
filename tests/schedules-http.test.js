import test from "node:test";
import assert from "node:assert/strict";
import { Router } from "express";
import { createApp } from "../src/app.js";
import { createScheduleRoutes } from "../src/modules/schedules/schedule.routes.js";
import { HTTP_STATUS } from "../src/utils/httpConstants.js";

test("schedule draft auth runs before its 512 KiB parser and other routes keep 32 KiB", async () => {
  const apiRouter = Router();
  apiRouter.use(
    "/schedules",
    createScheduleRoutes({
      authService: {
        async authenticate(token) {
          if (token !== "manager") throw new Error("bad token");
          return { id: "000000000000000000000001", roles: ["MANAGER"] };
        },
      },
      service: {
        async getDraft(weekStart) {
          return { weekStart, revision: 0, slots: [], updatedAt: null };
        },
        async updateDraft(weekStart, input) {
          return {
            weekStart,
            revision: input.expectedRevision + 1,
            slots: input.slots,
            updatedAt: null,
          };
        },
      },
    }),
  );
  apiRouter.post("/ordinary", (request, response) =>
    response.json({ data: request.body }),
  );
  const server = createApp({ apiRouter }).listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}/api/v1`;
  try {
    const denied = await fetch(`${baseUrl}/schedules/2026-11-02/draft`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        expectedRevision: 0,
        slots: [],
        padding: "x".repeat(600_000),
      }),
    });
    assert.equal(denied.status, HTTP_STATUS.UNAUTHORIZED);

    const oversized = await fetch(`${baseUrl}/schedules/2026-11-02/draft`, {
      method: "PUT",
      headers: {
        Authorization: "Bearer manager",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        expectedRevision: 0,
        slots: [],
        padding: "x".repeat(600_000),
      }),
    });
    assert.equal(oversized.status, HTTP_STATUS.PAYLOAD_TOO_LARGE);

    const largeButAllowed = await fetch(
      `${baseUrl}/schedules/2026-11-02/draft`,
      {
        method: "PUT",
        headers: {
          Authorization: "Bearer manager",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          expectedRevision: 0,
          slots: [],
          padding: "x".repeat(40_000),
        }),
      },
    );
    assert.equal(largeButAllowed.status, HTTP_STATUS.BAD_REQUEST);

    const ordinary = await fetch(`${baseUrl}/ordinary`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ padding: "x".repeat(40_000) }),
    });
    assert.equal(ordinary.status, HTTP_STATUS.PAYLOAD_TOO_LARGE);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
