import test from "node:test";
import assert from "node:assert/strict";
import {
  buildGroupDraft as createGroup,
  GroupService,
} from "../src/modules/groups/group.service.js";
import { InMemoryGroupRepository } from "./helpers/groupRepository.js";
import { createTestApp as createApp } from "./helpers/app.js";
import {
  GROUP_ERROR_CODES,
  GROUP_STATUS,
} from "../src/modules/groups/group.constants.js";
import { HTTP_STATUS, HTTP_ERROR_CODES } from "../src/utils/httpConstants.js";
import { authorizer } from "../src/modules/people/access/authorizer.js";
import { testAuthHeaders } from "./helpers/app.js";

test("Сценарій без HTTP відхиляє переповнену групу та не зберігає її", async () => {
  const groupRepository = new InMemoryGroupRepository();
  const scenario = new GroupService({
    groupRepository,
    authorizer,
    groupAccessPolicy: { readScope: async () => ({ kind: "ALL" }) },
  });
  const actor = { id: "admin-1", roles: ["ADMIN"] };
  await assert.rejects(
    scenario.createGroup(
      { name: "Сонечка", ageCategory: 2, capacity: 21 },
      actor,
    ),
    {
      code: GROUP_ERROR_CODES.INVALID_CAPACITY,
    },
  );
  const result = await groupRepository.findAll({
    page: 1,
    pageSize: 20,
  });

  assert.equal(result.total, 0);
  assert.deepEqual(result.groups, []);
});

test("Зміна отриманого об’єкта не змінює сховище", async () => {
  const repository = new InMemoryGroupRepository();
  const group = await repository.insert(
    createGroup({ name: "Сонечка", ageCategory: 2, capacity: 20 }),
  );
  group.name = "Стороння зміна";
  assert.equal((await repository.findById(group.id)).name, "Сонечка");
});

test("Маршрути створюють і читають групу та коректно повертають помилки", async () => {
  const server = createApp().listen(0, "127.0.0.1");
  await new Promise((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const authorization = testAuthHeaders();
  try {
    assert.equal(
      (await fetch(`${baseUrl}/api/v1/groups`)).status,
      HTTP_STATUS.UNAUTHORIZED,
    );
    const parentWrite = await fetch(`${baseUrl}/api/v1/groups`, {
      method: "POST",
      headers: {
        ...testAuthHeaders("test-parent"),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: "Батьківська",
        ageCategory: 3,
        capacity: 15,
      }),
    });
    assert.equal(parentWrite.status, HTTP_STATUS.FORBIDDEN);

    const response = await fetch(`${baseUrl}/api/v1/groups`, {
      method: "POST",
      headers: { ...authorization, "Content-Type": "application/json" },
      body: JSON.stringify({
        name: " Мандрівники ",
        ageCategory: 4,
        capacity: 20,
      }),
    });
    assert.equal(response.status, HTTP_STATUS.CREATED);
    const group = (await response.json()).data;
    assert.equal(group.name, "Мандрівники");
    assert.equal(group.status, GROUP_STATUS.DRAFT);
    const readResponse = await fetch(
      baseUrl + response.headers.get("location"),
      { headers: authorization },
    );
    assert.deepEqual((await readResponse.json()).data, group);

    const missing = await fetch(`${baseUrl}/api/v1/groups/missing`, {
      headers: authorization,
    });
    assert.equal(missing.status, HTTP_STATUS.NOT_FOUND);
    assert.equal(
      (await missing.json()).error.code,
      GROUP_ERROR_CODES.NOT_FOUND,
    );

    const malformed = await fetch(`${baseUrl}/api/v1/groups`, {
      method: "POST",
      headers: { ...authorization, "Content-Type": "application/json" },
      body: "{",
    });
    assert.equal(malformed.status, HTTP_STATUS.BAD_REQUEST);
    assert.equal(
      (await malformed.json()).error.code,
      HTTP_ERROR_CODES.INVALID_JSON,
    );

    const invalid = await fetch(`${baseUrl}/api/v1/groups`, {
      method: "POST",
      headers: { ...authorization, "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Група", ageCategory: 3, capacity: 21 }),
    });
    assert.equal(invalid.status, HTTP_STATUS.BAD_REQUEST);
    const invalidError = (await invalid.json()).error;
    assert.equal(invalidError.code, HTTP_ERROR_CODES.VALIDATION_ERROR);
    assert.ok(
      invalidError.details.some((detail) => detail.field === "capacity"),
    );
    const unknownField = await fetch(`${baseUrl}/api/v1/groups`, {
      method: "POST",
      headers: { ...authorization, "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Група",
        ageCategory: 3,
        capacity: 20,
        status: "ACTIVE",
      }),
    });
    assert.equal(unknownField.status, HTTP_STATUS.BAD_REQUEST);
    assert.equal(
      (await unknownField.json()).error.code,
      HTTP_ERROR_CODES.VALIDATION_ERROR,
    );

    const oversized = await fetch(`${baseUrl}/api/v1/groups`, {
      method: "POST",
      headers: { ...authorization, "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "а".repeat(40000),
        ageCategory: 3,
        capacity: 20,
      }),
    });
    assert.equal(oversized.status, HTTP_STATUS.PAYLOAD_TOO_LARGE);
    assert.equal(
      (await oversized.json()).error.code,
      HTTP_ERROR_CODES.BODY_TOO_LARGE,
    );
    const list = await fetch(`${baseUrl}/api/v1/groups`, {
      headers: authorization,
    });
    assert.equal((await list.json()).meta.total, 3);
    const parentList = await fetch(`${baseUrl}/api/v1/groups`, {
      headers: testAuthHeaders("test-parent"),
    });
    assert.equal((await parentList.json()).meta.total, 0);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
