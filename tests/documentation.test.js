import test from "node:test";
import assert from "node:assert/strict";
import { createTestApp as createApp } from "./helpers/app.js";
import { readSecurityConfig } from "../src/config/security.js";
import { HTTP_STATUS } from "../src/utils/httpConstants.js";
import { Router } from "express";
import { createApp as createHttpApp } from "../src/app.js";
import packageInfo from "../package.json" with { type: "json" };
import { createOpenApiDocument } from "../src/openapi/document.js";
import {
  createGroupSchema,
  groupResponseSchema,
  groupListResponseSchema,
  ageSummaryResponseSchema,
} from "../src/modules/groups/group.schema.js";
import { errorResponseSchema } from "../src/openapi/common.js";
import { GROUP_LIMITS } from "../src/modules/groups/group.constants.js";

// Перевіряємо контракт, доступність локальних ресурсів і збереження HTTP-захисту.
test("OpenAPI та Swagger UI описують і обслуговують поточний API", async () => {
  const server = createApp({ securityConfig: readSecurityConfig({}) }).listen(
    0,
    "127.0.0.1",
  );
  await new Promise((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  try {
    const contractResponse = await fetch(`${baseUrl}/api/v1/openapi.json`);
    assert.equal(contractResponse.status, HTTP_STATUS.OK);
    assert.equal(
      contractResponse.headers.get("x-content-type-options"),
      "nosniff",
    );
    const contract = await contractResponse.json();
    assert.equal(contract.openapi, "3.1.0");
    assert.deepEqual(contract.components.securitySchemes.BearerAuth, {
      type: "http",
      scheme: "bearer",
      bearerFormat: "JWT",
    });
    assert.equal(
      contract.components.schemas.CreateGroupInput.additionalProperties,
      false,
    );
    const parameters = contract.paths["/api/v1/groups"].get.parameters;

    assert.deepEqual(parameters.map((parameter) => parameter.name).sort(), [
      "page",
      "pageSize",
    ]);
    const info = (await (await fetch(`${baseUrl}/api/v1`)).json()).data;
    assert.equal(info.version, packageInfo.version);
    assert.deepEqual(
      Object.keys(info).sort(),
      contract.components.schemas.ApiInfoResponse.properties.data.required.toSorted(),
    );

    const created = await fetch(`${baseUrl}/api/v1/groups`, {
      method: "POST",
      headers: {
        Authorization: "Bearer test-admin",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: "Мандрівники",
        ageCategory: 4,
        capacity: 20,
      }),
    });
    assert.ok(contract.paths["/api/v1/groups"].post.responses[created.status]);
    const group = (await created.json()).data;
    groupResponseSchema.parse({ data: group });
    assert.deepEqual(
      Object.keys(group).sort(),
      contract.components.schemas.Group.required.toSorted(),
    );
    assert.ok(
      contract.components.schemas.Group.properties.status.enum.includes(
        group.status,
      ),
    );

    const authHeaders = { Authorization: "Bearer test-admin" };
    const list = await fetch(`${baseUrl}/api/v1/groups`, {
      headers: authHeaders,
    });
    groupListResponseSchema.parse(await list.json());
    const summary = await fetch(`${baseUrl}/api/v1/groups/summary`, {
      headers: authHeaders,
    });
    ageSummaryResponseSchema.parse(await summary.json());
    const missing = await fetch(`${baseUrl}/api/v1/groups/missing`, {
      headers: authHeaders,
    });
    assert.equal(missing.status, HTTP_STATUS.NOT_FOUND);
    errorResponseSchema.parse(await missing.json());

    const page = await fetch(`${baseUrl}/api-docs/`);
    assert.equal(page.status, HTTP_STATUS.OK);
    assert.match(await page.text(), /swagger-ui-bundle\.js/);
    assert.ok(page.headers.get("content-security-policy"));

    const init = await fetch(`${baseUrl}/api-docs/swagger-ui-init.js`);
    assert.equal(init.status, HTTP_STATUS.OK);
    const initScript = await init.text();
    assert.match(initScript, /\/api\/v1\/openapi\.json/);
    assert.match(initScript, /"validatorUrl": null/);

    const styles = await fetch(`${baseUrl}/api-docs/swagger-ui.css`);
    assert.equal(styles.status, HTTP_STATUS.OK);
    assert.match(styles.headers.get("content-type"), /text\/css/);
    assert.ok((await styles.text()).length > 0);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("OpenAPI бере обмеження входу зі схем Zod і зберігає всі поточні операції", () => {
  const document = createOpenApiDocument();
  const input = document.components.schemas.CreateGroupInput;
  assert.equal(input.properties.name.minLength, GROUP_LIMITS.MIN_NAME_LENGTH);
  assert.equal(input.properties.name.maxLength, GROUP_LIMITS.MAX_NAME_LENGTH);
  assert.equal(
    input.properties.ageCategory.minimum,
    GROUP_LIMITS.MIN_AGE_CATEGORY,
  );
  assert.equal(
    input.properties.ageCategory.maximum,
    GROUP_LIMITS.MAX_AGE_CATEGORY,
  );
  assert.equal(input.properties.capacity.minimum, GROUP_LIMITS.MIN_CAPACITY);
  assert.equal(input.properties.capacity.maximum, GROUP_LIMITS.MAX_CAPACITY);
  assert.deepEqual(
    input.required.toSorted(),
    Object.keys(createGroupSchema.shape).toSorted(),
  );
  assert.equal(input.additionalProperties, false);
  assert.equal(document.info.version, packageInfo.version);
  assert.deepEqual(
    document.components.schemas.ApiInfoResponse.properties.data.properties
      .version.enum,
    [packageInfo.version],
  );
  assert.deepEqual(
    Object.entries(document.paths)
      .flatMap(([path, methods]) =>
        Object.keys(methods).map((method) => `${method.toUpperCase()} ${path}`),
      )
      .sort(),
    [
      "GET /api-docs/",
      "GET /api/v1",
      "GET /api/v1/auth/me",
      "GET /api/v1/people/{id}/employee",
      "GET /api/v1/children",
      "GET /api/v1/children/{id}",
      "GET /api/v1/catalog/versions/{kind}/{code}",
      "GET /api/v1/groups",
      "GET /api/v1/groups/summary",
      "GET /api/v1/groups/{id}",
      "GET /api/v1/invoices/children/{childId}",
      "PATCH /api/v1/groups/{id}/capacity",
      "GET /api/v1/openapi.json",
      "GET /health/live",
      "GET /health/ready",
      "PATCH /api/v1/children/{id}",
      "POST /api/v1/auth/login",
      "POST /api/v1/auth/logout-all",
      "POST /api/v1/auth/password",
      "POST /api/v1/children",
      "POST /api/v1/children/{id}/enroll",
      "POST /api/v1/children/{id}/resume",
      "POST /api/v1/children/{id}/suspend",
      "POST /api/v1/children/{id}/transfer",
      "POST /api/v1/children/{id}/benefits",
      "POST /api/v1/catalog/versions",
      "POST /api/v1/groups",
      "POST /api/v1/groups/{id}/deactivate",
      "POST /api/v1/groups/{id}/transfer-next-year",
      "POST /api/v1/invoices/children/{childId}/generate-current-month",
      "POST /api/v1/payments",
      "PUT /api/v1/groups/{id}/resources",
      "PUT /api/v1/people/{id}/employee",
      "PUT /api/v1/people/{id}/account/roles",
    ].sort(),
  );
});

test("Складання OpenAPI повторюване, усі посилання на компоненти існують", () => {
  const document = createOpenApiDocument();
  assert.deepEqual(createOpenApiDocument(), document);
  const operationIds = [];
  for (const methods of Object.values(document.paths)) {
    for (const operation of Object.values(methods))
      operationIds.push(operation.operationId);
  }
  assert.equal(new Set(operationIds).size, operationIds.length);
  function checkReferences(value) {
    if (!value || typeof value !== "object") return;
    if (value.$ref) {
      assert.ok(
        value.$ref.startsWith("#/"),
        "Контракт не потребує зовнішніх файлів",
      );
      let target = document;
      for (const key of value.$ref.slice(2).split("/")) {
        target = target?.[key.replaceAll("~1", "/").replaceAll("~0", "~")];
      }
      assert.ok(target, `Невідоме посилання ${value.$ref}`);
    }
    for (const child of Object.values(value)) checkReferences(child);
  }
  checkReferences(document);
});

test("Застосунок приймає довільний router без залежності від груп", async () => {
  const router = Router();
  router.get("/example", (request, response) =>
    response.json({ data: { value: "independent" } }),
  );
  const server = createHttpApp({ apiRouter: router }).listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  try {
    const response = await fetch(
      `http://127.0.0.1:${server.address().port}/api/v1/example`,
    );
    assert.equal(response.status, HTTP_STATUS.OK);
    assert.deepEqual(await response.json(), { data: { value: "independent" } });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
