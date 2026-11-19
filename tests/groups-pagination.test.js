import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { createTestApp } from "./helpers/app.js";
import { InMemoryGroupRepository } from "./helpers/groupRepository.js";
import {
  GROUP_STATUS,
  GROUP_PAGINATION,
} from "../src/modules/groups/group.constants.js";
import { HTTP_STATUS, HTTP_ERROR_CODES } from "../src/utils/httpConstants.js";
import { groupListResponseSchema } from "../src/modules/groups/group.schema.js";
import { testAuthHeaders } from "./helpers/app.js";

const fetchAdmin = (url, options = {}) =>
  fetch(url, {
    ...options,
    headers: { ...testAuthHeaders(), ...(options.headers ?? {}) },
  });

test("Список груп повертає сторінки у стабільному порядку", async (t) => {
  // Однакові назви та зворотний порядок перевіряють сортування за ID.
  const groups = Array.from({ length: 8 }, (_, index) => ({
    id: String(index + 1).padStart(24, "0"),
    name: "Група",
    ageCategory: 3,
    capacity: 20,
    status: GROUP_STATUS.DRAFT,
  }));

  const groupRepository = new InMemoryGroupRepository([...groups].reverse());

  const server = createTestApp({ groupRepository }).listen(0, "127.0.0.1");

  t.after(() => new Promise((resolve) => server.close(resolve)));
  await once(server, "listening");

  const url = `http://127.0.0.1:${server.address().port}/api/v1/groups`;

  for (const page of [1, 2, 3]) {
    const response = await fetchAdmin(`${url}?page=${page}&pageSize=5`);

    assert.equal(response.status, HTTP_STATUS.OK);

    const body = await response.json();
    groupListResponseSchema.parse(body);

    const skip = (page - 1) * 5;
    const expectedIds = groups.slice(skip, skip + 5).map((group) => group.id);

    assert.deepEqual(
      body.data.map((group) => group.id),
      expectedIds,
    );

    assert.deepEqual(body.meta, {
      page,
      pageSize: 5,
      total: 8,
      totalPages: 2,
    });
  }

  // Повторне читання повертає ту саму сторінку.
  const repeated = await fetchAdmin(`${url}?page=1&pageSize=5`);
  assert.deepEqual(
    (await repeated.json()).data.map((group) => group.id),
    groups.slice(0, 5).map((group) => group.id),
  );

  const defaults = await fetchAdmin(url);
  const body = await defaults.json();

  assert.equal(defaults.status, HTTP_STATUS.OK);
  assert.equal(body.data.length, 8);
  assert.deepEqual(body.meta, {
    page: GROUP_PAGINATION.DEFAULT_PAGE,
    pageSize: GROUP_PAGINATION.DEFAULT_PAGE_SIZE,
    total: 8,
    totalPages: 1,
  });
});

test("Порожній список та помилки параметрів обробляються коректно", async (t) => {
  const groupRepository = new InMemoryGroupRepository();
  const server = createTestApp({ groupRepository }).listen(0, "127.0.0.1");

  t.after(() => new Promise((resolve) => server.close(resolve)));
  await once(server, "listening");

  const url = `http://127.0.0.1:${server.address().port}/api/v1/groups`;

  const emptyResponse = await fetchAdmin(`${url}?page=1&pageSize=5`);

  assert.equal(emptyResponse.status, HTTP_STATUS.OK);
  assert.deepEqual(await emptyResponse.json(), {
    data: [],
    meta: {
      page: 1,
      pageSize: 5,
      total: 0,
      totalPages: 0,
    },
  });

  for (const query of [
    "page=0",
    "page=-1",
    "page=1.5",
    "page=abc",
    "page=",
    "pageSize=0",
    `pageSize=${GROUP_PAGINATION.MAX_PAGE_SIZE + 1}`,
    "page=1&page=2",
    "unknown=value",
  ]) {
    const response = await fetchAdmin(`${url}?${query}`);
    const body = await response.json();

    assert.equal(response.status, HTTP_STATUS.BAD_REQUEST, query);
    assert.equal(body.error.code, HTTP_ERROR_CODES.VALIDATION_ERROR, query);
  }
});
