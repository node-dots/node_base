import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const openApi = JSON.parse(
  await readFile(path.join(root, "docs", "api", "openapi.json"), "utf8"),
);

const folderNames = [
  "01. Health & Readiness",
  "02. Authentication",
  "03. Accounts & Roles",
  "04. People & Employees",
  "05. Catalog",
  "06. Groups",
  "07. Children",
  "08. Enrollment & Membership",
  "09. Financial Rules & Benefits",
  "10. Invoices",
  "11. Payments",
  "12. Refunds",
  "13. Expenses & Payroll",
  "14. Schedules",
  "15. Financial Reports",
  "16. Operational Reports",
  "17. Forecast & Configuration Search",
  "18. Security & Permissions",
  "19. Error Handling",
  "20. Complete End-to-End Scenario",
];

const folders = Object.fromEntries(
  folderNames.map((name) => [name, { name, item: [] }]),
);

const commonTests = ({
  expected,
  json = true,
  envelope = true,
  secretCheck = true,
}) => [
  `pm.test("HTTP status is one of: ${expected.join(", ")}", function () { pm.expect(pm.response.code).to.be.oneOf(${JSON.stringify(expected)}); });`,
  'pm.test("Response time is below 5 seconds", function () { pm.expect(pm.response.responseTime).to.be.below(5000); });',
  ...(json
    ? [
        'pm.test("Response is JSON", function () { pm.response.to.have.header("Content-Type"); pm.expect(pm.response.headers.get("Content-Type")).to.include("application/json"); });',
        "let responseJson; try { responseJson = pm.response.json(); } catch (error) { responseJson = null; }",
        ...(envelope
          ? [
              'pm.test("Response has a data or error envelope", function () { pm.expect(responseJson).to.be.an("object"); pm.expect(responseJson).to.satisfy(function (value) { return Object.prototype.hasOwnProperty.call(value, "data") || Object.prototype.hasOwnProperty.call(value, "error"); }); });',
            ]
          : []),
        ...(secretCheck
          ? [
              'pm.test("Response does not expose stored secrets", function () { const raw = pm.response.text(); pm.expect(raw).not.to.match(/passwordHash|JWT_SECRET|currentPassword|newPassword/i); });',
            ]
          : []),
      ]
    : [
        'pm.test("Swagger returns HTML", function () { pm.expect(pm.response.headers.get("Content-Type")).to.include("text/html"); });',
      ]),
];

function makeRequest({
  name,
  method = "GET",
  url,
  auth = "admin",
  body,
  expected = [200],
  tests = [],
  prerequest = [],
  json = true,
  envelope = true,
  secretCheck = true,
  description,
  headers = [],
}) {
  const requestHeaders = [...headers];
  if (body !== undefined)
    requestHeaders.push({ key: "Content-Type", value: "application/json" });
  if (auth === "admin")
    requestHeaders.push({
      key: "Authorization",
      value: "Bearer {{accessToken}}",
      type: "text",
    });
  if (auth === "parent")
    requestHeaders.push({
      key: "Authorization",
      value: "Bearer {{parentToken}}",
      type: "text",
    });
  if (auth === "forged")
    requestHeaders.push({
      key: "Authorization",
      value: "Bearer forged.invalid.token",
      type: "text",
    });
  const events = [];
  if (prerequest.length)
    events.push({
      listen: "prerequest",
      script: { type: "text/javascript", exec: prerequest },
    });
  events.push({
    listen: "test",
    script: {
      type: "text/javascript",
      exec: [
        ...commonTests({ expected, json, envelope, secretCheck }),
        ...tests,
      ],
    },
  });
  return {
    name,
    request: {
      method,
      header: requestHeaders,
      url: `{{baseUrl}}${url}`,
      ...(body === undefined
        ? {}
        : {
            body: {
              mode: "raw",
              raw:
                typeof body === "string" ? body : JSON.stringify(body, null, 2),
              options: { raw: { language: "json" } },
            },
          }),
      description:
        description ??
        `Фактичний запит ${method} ${url}. Очікувані статуси: ${expected.join(", ")}.`,
    },
    event: events,
  };
}

function add(folder, options) {
  folders[folder].item.push(makeRequest(options));
}

const H = "01. Health & Readiness";
add(H, {
  name: "Liveness",
  url: "/health/live",
  auth: "none",
  tests: [
    'pm.test("Service is alive", function () { pm.expect(responseJson.data.status).to.eql("OK"); });',
  ],
});
add(H, {
  name: "Readiness",
  url: "/health/ready",
  auth: "none",
  tests: [
    'pm.test("MongoDB is ready", function () { pm.expect(responseJson.data.status).to.eql("READY"); pm.expect(responseJson.data.storage).to.eql("MONGODB"); });',
  ],
});
add(H, {
  name: "API information",
  url: "/api/v1",
  auth: "none",
  tests: [
    'pm.test("API metadata is current", function () { pm.expect(responseJson.data.openapi).to.eql("/api/v1/openapi.json"); });',
  ],
});
add(H, {
  name: "OpenAPI JSON",
  url: "/api/v1/openapi.json",
  auth: "none",
  envelope: false,
  secretCheck: false,
  tests: [
    'pm.test("OpenAPI document is 3.1", function () { pm.expect(responseJson.openapi).to.match(/^3\.1/); pm.expect(responseJson.paths).to.be.an("object"); });',
  ],
});
add(H, { name: "Swagger UI", url: "/api-docs/", auth: "none", json: false });

const A = "02. Authentication";
add(A, {
  name: "Login as ADMIN",
  method: "POST",
  url: "/api/v1/auth/login",
  auth: "none",
  body: { email: "{{adminEmail}}", password: "{{adminPassword}}" },
  tests: [
    'pm.test("Access token is returned", function () { pm.expect(responseJson.data.accessToken).to.be.a("string").and.not.empty; });',
    'pm.environment.set("accessToken", responseJson.data.accessToken);',
  ],
});
add(A, {
  name: "ADMIN profile",
  url: "/api/v1/auth/me",
  tests: [
    'pm.test("ADMIN role is active", function () { pm.expect(responseJson.data.roles).to.include("ADMIN"); });',
    'pm.environment.set("adminId", responseJson.data.id);',
  ],
});
add(A, {
  name: "Login as PARENT",
  method: "POST",
  url: "/api/v1/auth/login",
  auth: "none",
  body: { email: "{{parentEmail}}", password: "{{parentPassword}}" },
  tests: [
    'pm.test("Parent token is returned", function () { pm.expect(responseJson.data.accessToken).to.be.a("string").and.not.empty; });',
    'pm.environment.set("parentToken", responseJson.data.accessToken);',
  ],
});
add(A, {
  name: "PARENT profile",
  url: "/api/v1/auth/me",
  auth: "parent",
  tests: [
    'pm.test("PARENT role is active", function () { pm.expect(responseJson.data.roles).to.include("PARENT"); });',
    'pm.environment.set("parentId", responseJson.data.id);',
  ],
});
add(A, {
  name: "Invalid password is rejected",
  method: "POST",
  url: "/api/v1/auth/login",
  auth: "none",
  body: { email: "{{adminEmail}}", password: "definitely-wrong-password" },
  expected: [401],
  tests: [
    'pm.test("Failure is public and safe", function () { pm.expect(responseJson.error.code).to.eql("INVALID_CREDENTIALS"); });',
  ],
});
add(A, {
  name: "Password change rejects wrong current password",
  method: "POST",
  url: "/api/v1/auth/password",
  body: {
    currentPassword: "wrong-current-password",
    newPassword: "Postman-New-Password-123!",
  },
  expected: [401],
});
add(A, {
  name: "Logout-all requires JWT",
  method: "POST",
  url: "/api/v1/auth/logout-all",
  auth: "none",
  expected: [401],
});

const AR = "03. Accounts & Roles";
add(AR, {
  name: "Preserve PARENT role",
  method: "PUT",
  url: "/api/v1/people/{{parentId}}/account/roles",
  body: { roles: ["PARENT"] },
  tests: [
    'pm.test("Role assignment is audited and stable", function () { pm.expect(responseJson.data.roles).to.include("PARENT"); });',
  ],
});
add(AR, {
  name: "Refresh PARENT token after role mutation",
  method: "POST",
  url: "/api/v1/auth/login",
  auth: "none",
  body: { email: "{{parentEmail}}", password: "{{parentPassword}}" },
  tests: [
    'pm.test("Fresh parent token is returned", function () { pm.expect(responseJson.data.accessToken).to.be.a("string").and.not.empty; });',
    'pm.environment.set("parentToken", responseJson.data.accessToken);',
  ],
});

const P = "04. People & Employees";
add(P, {
  name: "List employees",
  url: "/api/v1/people/employees?page=1&pageSize=100",
  tests: [
    'pm.test("Employee page is non-empty", function () { pm.expect(responseJson.data.employees).to.be.an("array").that.is.not.empty; });',
    'pm.environment.set("employeeId", responseJson.data.employees[0].id);',
  ],
});
add(P, {
  name: "Read employee",
  url: "/api/v1/people/{{employeeId}}/employee",
  tests: [
    'pm.test("Employee id matches", function () { pm.expect(responseJson.data.id).to.eql(pm.environment.get("employeeId")); });',
  ],
});
add(P, {
  name: "Idempotent employee profile update",
  method: "PUT",
  url: "/api/v1/people/{{employeeId}}/employee",
  body: {},
  tests: [
    'pm.test("Employee remains available", function () { pm.expect(responseJson.data.id).to.eql(pm.environment.get("employeeId")); });',
  ],
});

const C = "05. Catalog";
add(C, {
  name: "Create dated benefit version",
  method: "POST",
  url: "/api/v1/catalog/versions",
  body: {
    kind: "BENEFIT",
    code: "{{testSubjectCode}}",
    name: "Postman validation benefit",
    effectiveFrom: "{{nextMonth}}-01",
    basisPoints: 500,
  },
  expected: [201],
  tests: [
    'pm.test("Catalog version was created", function () { pm.expect(responseJson.data.code).to.eql(pm.environment.get("testSubjectCode")); });',
  ],
});
add(C, {
  name: "Read created benefit for date",
  url: "/api/v1/catalog/versions/BENEFIT/{{testSubjectCode}}?date={{nextMonth}}-01",
  tests: [
    'pm.test("Created benefit is effective", function () { pm.expect(responseJson.data.code).to.eql(pm.environment.get("testSubjectCode")); pm.expect(responseJson.data.basisPoints).to.eql(500); });',
  ],
});

const G = "06. Groups";
add(G, {
  name: "List groups and capture live resources",
  url: "/api/v1/groups?page=1&pageSize=100",
  tests: [
    'pm.test("Groups page is populated", function () { pm.expect(responseJson.data).to.be.an("array").that.is.not.empty; });',
    'const groups = responseJson.data; const active = groups.find(function (g) { return g.status === "ACTIVE"; }); const empty = groups.find(function (g) { return g.status === "ACTIVE" && g.occupiedSeats === 0; }); const full = groups.find(function (g) { return g.status === "ACTIVE" && g.occupiedSeats === g.capacity; });',
    'pm.expect(active, "an ACTIVE group").to.exist; pm.expect(empty, "an empty ACTIVE group").to.exist;',
    'pm.environment.set("groupId", active.id); pm.environment.set("emptyGroupId", empty.id); pm.environment.set("fullGroupId", full ? full.id : active.id);',
    'pm.environment.set("emptyGroupResources", JSON.stringify({ schoolYear: empty.schoolYear, ageCategoryId: empty.ageCategoryId, roomId: empty.roomId, educatorId: empty.educatorId, assistantId: empty.assistantId, capacity: empty.capacity }));',
  ],
});
add(G, {
  name: "Group age summary",
  url: "/api/v1/groups/summary",
  tests: [
    'pm.test("Summary is aggregate-only", function () { pm.expect(responseJson.data).to.be.an("array"); });',
  ],
});
add(G, {
  name: "Read group",
  url: "/api/v1/groups/{{groupId}}",
  tests: [
    'pm.test("Group id matches", function () { pm.expect(responseJson.data.id).to.eql(pm.environment.get("groupId")); });',
  ],
});
add(G, {
  name: "Create DRAFT group",
  method: "POST",
  url: "/api/v1/groups",
  body: { name: "Postman {{testRunId}}", ageCategory: 2, capacity: 18 },
  expected: [201],
  tests: [
    'pm.test("Draft group was created", function () { pm.expect(responseJson.data.status).to.eql("DRAFT"); });',
    'pm.environment.set("createdGroupId", responseJson.data.id);',
  ],
});
add(G, {
  name: "Change DRAFT group capacity",
  method: "PATCH",
  url: "/api/v1/groups/{{createdGroupId}}/capacity",
  body: { capacity: 17 },
  tests: [
    'pm.test("Capacity changed", function () { pm.expect(responseJson.data.capacity).to.eql(17); });',
  ],
});
add(G, {
  name: "Activation rejects occupied resources",
  method: "PUT",
  url: "/api/v1/groups/{{createdGroupId}}/resources",
  body: "{{emptyGroupResources}}",
  expected: [409],
  tests: [
    'pm.test("Conflict is explicit", function () { pm.expect(responseJson.error.code).to.be.a("string"); });',
  ],
});
add(G, {
  name: "Non-empty group cannot be deactivated",
  method: "POST",
  url: "/api/v1/groups/{{fullGroupId}}/deactivate",
  expected: [409],
});
add(G, {
  name: "Current-year occupied group cannot be blindly transferred",
  method: "POST",
  url: "/api/v1/groups/{{fullGroupId}}/transfer-next-year",
  expected: [409],
});

const CH = "07. Children";
add(CH, {
  name: "List children as ADMIN",
  url: "/api/v1/children?page=1&pageSize=100",
  tests: [
    'pm.test("Children page is populated", function () { pm.expect(responseJson.data.children).to.be.an("array").that.is.not.empty; });',
    'pm.environment.set("childId", responseJson.data.children[0].id);',
  ],
});
add(CH, {
  name: "Create applicant without guardian",
  method: "POST",
  url: "/api/v1/children",
  body: {
    firstName: "Postman",
    lastName: "Applicant {{testRunId}}",
    dateOfBirth: "{{e2eDob}}",
  },
  expected: [201],
  tests: [
    'pm.test("Applicant state is explicit", function () { pm.expect(responseJson.data.status).to.eql("APPLICANT"); });',
    'pm.environment.set("applicantId", responseJson.data.id);',
  ],
});
add(CH, {
  name: "Read applicant",
  url: "/api/v1/children/{{applicantId}}",
  tests: [
    'pm.test("Applicant id matches", function () { pm.expect(responseJson.data.id).to.eql(pm.environment.get("applicantId")); });',
  ],
});
add(CH, {
  name: "Update applicant nutrition",
  method: "PATCH",
  url: "/api/v1/children/{{applicantId}}",
  body: {
    food: {
      preferences: ["fruit"],
      exclusions: [],
      allergyNotes: [],
      note: "Postman test",
    },
  },
  tests: [
    'pm.test("Nutrition changed", function () { pm.expect(responseJson.data.food.preferences).to.include("fruit"); });',
  ],
});

const E = "08. Enrollment & Membership";
add(E, {
  name: "Enrollment without guardian is rejected",
  method: "POST",
  url: "/api/v1/children/{{applicantId}}/enroll",
  body: { groupId: "{{emptyGroupId}}" },
  expected: [422],
});
add(E, {
  name: "Duplicate transfer target is rejected",
  method: "POST",
  url: "/api/v1/children/{{childId}}/transfer",
  body: { groupId: "{{groupId}}" },
  expected: [200],
  tests: [
    'pm.test("Same-group transfer is idempotent", function () { pm.expect(responseJson.data.id).to.eql(pm.environment.get("childId")); });',
  ],
});
add(E, {
  name: "Applicant cannot be suspended",
  method: "POST",
  url: "/api/v1/children/{{applicantId}}/suspend",
  expected: [409],
});
add(E, {
  name: "Applicant cannot be resumed",
  method: "POST",
  url: "/api/v1/children/{{applicantId}}/resume",
  expected: [409],
});
add(E, {
  name: "Applicant withdrawal is rejected",
  method: "POST",
  url: "/api/v1/children/{{applicantId}}/withdraw",
  expected: [409],
});

const B = "09. Financial Rules & Benefits";
add(B, {
  name: "Read active benefit catalog",
  url: "/api/v1/catalog/versions/BENEFIT/BENEFIT_10?date={{currentDate}}",
  tests: [
    'pm.test("Benefit uses basis points", function () { pm.expect(responseJson.data.basisPoints).to.be.a("number"); });',
  ],
});
add(B, {
  name: "Assign benefit only to enrolled child",
  method: "POST",
  url: "/api/v1/children/{{applicantId}}/benefits",
  body: { benefitCode: "BENEFIT_10", startMonth: "{{currentMonth}}" },
  expected: [400],
});

const I = "10. Invoices";
add(I, {
  name: "List monthly invoices",
  url: "/api/v1/invoices?month={{currentMonth}}&page=1&pageSize=100",
  tests: [
    'pm.test("Invoice page is valid", function () { pm.expect(responseJson.data.invoices).to.be.an("array"); });',
    'const invoice = responseJson.data.invoices[0]; if (invoice) { pm.environment.set("invoiceId", invoice.id); pm.environment.set("invoiceChildId", invoice.childId); }',
  ],
});
add(I, {
  name: "Current balances",
  url: "/api/v1/invoices/current-balances",
  tests: [
    'pm.test("Balance values use integers", function () { const raw = JSON.stringify(responseJson.data); pm.expect(raw).not.to.match(/NaN|Infinity/); });',
  ],
});
add(I, {
  name: "Read child invoices",
  url: "/api/v1/invoices/children/{{invoiceChildId}}",
  tests: [
    'pm.test("Child invoice list is an array", function () { pm.expect(responseJson.data).to.be.an("array"); });',
  ],
});
add(I, {
  name: "Generate current-month invoices idempotently",
  method: "POST",
  url: "/api/v1/invoices/children/{{invoiceChildId}}/generate-current-month",
  expected: [200, 409],
});
add(I, {
  name: "Duplicate annual tuition is rejected",
  method: "POST",
  url: "/api/v1/invoices/children/{{invoiceChildId}}/annual-tuition",
  body: { firstMonth: "{{nextMonth}}" },
  expected: [201, 409],
});
add(I, {
  name: "Annual fallback observes business state",
  method: "POST",
  url: "/api/v1/invoices/children/{{invoiceChildId}}/fallback-expired-annual",
  expected: [200, 409],
});

const PAY = "11. Payments";
add(PAY, {
  name: "List monthly payments",
  url: "/api/v1/payments?month={{currentMonth}}&page=1&pageSize=100",
  tests: [
    'pm.test("Payment page is valid", function () { pm.expect(responseJson.data.payments).to.be.an("array"); });',
    'const pending = responseJson.data.payments.find(function (p) { return p.status === "PENDING"; }); const confirmed = responseJson.data.payments.find(function (p) { return p.status === "CONFIRMED"; }); if (pending) pm.environment.set("pendingPaymentId", pending.id); if (confirmed) pm.environment.set("confirmedPaymentId", confirmed.id);',
  ],
});
add(PAY, {
  name: "Report small PENDING payment",
  method: "POST",
  url: "/api/v1/payments",
  body: '{"invoiceId":"{{invoiceId}}","amountCents":1,"method":"BANK_TRANSFER","idempotencyKey":"postman-inventory-{{testRunId}}","payerPersonId":"{{parentId}}"}',
  expected: [201],
  tests: [
    'pm.test("Payment is pending", function () { pm.expect(responseJson.data.status).to.eql("PENDING"); });',
    'pm.environment.set("paymentId", responseJson.data.id);',
  ],
});
add(PAY, {
  name: "Confirm reported payment",
  method: "POST",
  url: "/api/v1/payments/{{paymentId}}/confirm",
  body: { occurredAt: "{{$isoTimestamp}}" },
  tests: [
    'pm.test("Payment is confirmed", function () { pm.expect(responseJson.data.status).to.eql("CONFIRMED"); });',
  ],
});
add(PAY, {
  name: "Reject seeded pending payment",
  method: "POST",
  url: "/api/v1/payments/{{pendingPaymentId}}/reject",
  expected: [200, 409],
});

const R = "12. Refunds";
add(R, {
  name: "Refund without withdrawal is rejected",
  method: "POST",
  url: "/api/v1/payments/{{paymentId}}/refund",
  body: {
    amountCents: 1,
    reason: "Postman controlled refund",
    idempotencyKey: "postman-refund-{{testRunId}}",
  },
  expected: [409],
  tests: [
    'pm.test("Refund requires recorded due amount", function () { pm.expect(responseJson.error.code).to.be.a("string"); });',
  ],
});
add(R, {
  name: "Read refund history",
  url: "/api/v1/payments/{{paymentId}}/refunds",
  tests: [
    'pm.test("Rejected refund leaves history unchanged", function () { pm.expect(responseJson.data).to.be.an("array").that.is.empty; });',
  ],
});

const X = "13. Expenses & Payroll";
add(X, {
  name: "List expenses",
  url: "/api/v1/expenses?month={{currentMonth}}&page=1&pageSize=100",
  tests: [
    'pm.test("Expense page is valid", function () { pm.expect(responseJson.data.expenses).to.be.an("array"); });',
  ],
});
add(X, {
  name: "Open current finance month",
  method: "POST",
  url: "/api/v1/expenses/open-current-month",
  expected: [201, 409],
});
add(X, {
  name: "Create expense draft",
  method: "POST",
  url: "/api/v1/expenses",
  body: {
    category: "OTHER",
    amountCents: 12345,
    serviceMonth: "{{currentMonth}}",
    reason: "Postman controlled expense",
  },
  expected: [201],
  tests: [
    'pm.test("Expense is DRAFT", function () { pm.expect(responseJson.data.status).to.eql("DRAFT"); });',
    'pm.environment.set("expenseId", responseJson.data.id);',
  ],
});
add(X, {
  name: "Approve expense",
  method: "POST",
  url: "/api/v1/expenses/{{expenseId}}/approve",
  tests: [
    'pm.test("Expense is approved", function () { pm.expect(responseJson.data.status).to.eql("APPROVED"); });',
  ],
});
add(X, {
  name: "Pay expense",
  method: "POST",
  url: "/api/v1/expenses/{{expenseId}}/pay",
  body: { paymentDate: "{{currentDate}}" },
  tests: [
    'pm.test("Expense records payment without inventing a status", function () { pm.expect(responseJson.data.status).to.eql("APPROVED"); pm.expect(responseJson.data.paidAt).to.be.a("string"); pm.expect(responseJson.data.paymentDate).to.eql(pm.environment.get("currentDate")); });',
  ],
});
add(X, {
  name: "Create expense correction",
  method: "POST",
  url: "/api/v1/expenses/{{expenseId}}/corrections",
  body: { amountCents: -345, reason: "Postman controlled correction" },
  expected: [201, 409],
});
add(X, {
  name: "Create expense for cancellation",
  method: "POST",
  url: "/api/v1/expenses",
  body: {
    category: "OTHER",
    amountCents: 777,
    serviceMonth: "{{currentMonth}}",
    reason: "Postman cancellation fixture",
  },
  expected: [201],
  tests: ['pm.environment.set("cancelExpenseId", responseJson.data.id);'],
});
add(X, {
  name: "Cancel expense",
  method: "POST",
  url: "/api/v1/expenses/{{cancelExpenseId}}/cancel",
  tests: [
    'pm.test("Expense is cancelled", function () { pm.expect(responseJson.data.status).to.eql("CANCELLED"); });',
  ],
});
add(X, {
  name: "Expense totals",
  url: "/api/v1/expenses/totals?month={{currentMonth}}",
  tests: [
    'pm.test("Totals are integer cents", function () { pm.expect(responseJson.data.approvedAmountCents).to.be.a("number"); pm.expect(responseJson.data.cashOutflowCents).to.be.a("number"); });',
  ],
});

const S = "14. Schedules";
add(S, {
  name: "Read seeded draft",
  url: "/api/v1/schedules/{{draftWeek}}/draft",
  tests: [
    'pm.environment.set("scheduleRevision", responseJson.data.revision); pm.environment.set("scheduleSlots", JSON.stringify(responseJson.data.slots)); pm.environment.set("scheduleId", responseJson.data.id || responseJson.data.weekStart);',
  ],
});
add(S, {
  name: "Generate complete draft",
  method: "POST",
  url: "/api/v1/schedules/{{draftWeek}}/generate",
  body: '{"expectedRevision":{{scheduleRevision}},"fixedSlots":{{scheduleSlots}}}',
  tests: [
    'pm.environment.set("scheduleRevision", responseJson.data.draft.revision); pm.environment.set("scheduleSlots", JSON.stringify(responseJson.data.slots));',
    'pm.test("Generated draft has slots", function () { pm.expect(responseJson.data.slots).to.be.an("array").that.is.not.empty; });',
  ],
});
add(S, {
  name: "Update generated draft",
  method: "PUT",
  url: "/api/v1/schedules/{{draftWeek}}/draft",
  body: '{"expectedRevision":{{scheduleRevision}},"slots":{{scheduleSlots}}}',
  tests: [
    'pm.environment.set("scheduleRevision", responseJson.data.revision); pm.environment.set("scheduleSlots", JSON.stringify(responseJson.data.slots));',
  ],
});
add(S, {
  name: "Publish schedule",
  method: "POST",
  url: "/api/v1/schedules/{{draftWeek}}/publish",
  body: '{"expectedRevision":{{scheduleRevision}}}',
  tests: [
    'pm.test("Schedule is published", function () { pm.expect(responseJson.data.revision).to.eql(Number(pm.environment.get("scheduleRevision"))); pm.expect(responseJson.data.publishedAt).to.be.a("string"); });',
  ],
});
add(S, {
  name: "Read published schedule",
  url: "/api/v1/schedules/{{draftWeek}}/published",
  tests: [
    'pm.test("Published snapshot is non-empty", function () { pm.expect(responseJson.data.slots).to.be.an("array").that.is.not.empty; });',
  ],
});

add("15. Financial Reports", {
  name: "Monthly finance report",
  url: "/api/v1/reports/finance/monthly?month={{currentMonth}}",
  tests: [
    'pm.test("Financial metrics are exact integers", function () { ["accruedIncomeMinor","receiptsNetMinor","expensesMinor","cashFlowMinor"].forEach(function (key) { pm.expect(responseJson.data[key], key).to.be.a("number"); }); });',
  ],
});

const O = "16. Operational Reports";
add(O, {
  name: "Benefit distribution",
  url: "/api/v1/reports/operations/benefits?month={{currentMonth}}",
  tests: [
    'pm.test("Benefits report is aggregate data", function () { pm.expect(responseJson.data.distribution).to.be.an("array"); });',
  ],
});
add(O, {
  name: "Published teacher load",
  url: "/api/v1/reports/operations/teacher-load?weekStart={{publishedWeek}}",
  tests: [
    'pm.test("Teacher-load report is an array", function () { pm.expect(responseJson.data.teachers).to.be.an("array"); });',
  ],
});
add(O, {
  name: "Approved expense categories",
  url: "/api/v1/reports/finance/expense-categories?month={{currentMonth}}",
  tests: [
    'pm.test("Expense categories are aggregate data", function () { pm.expect(responseJson.data.categories).to.be.an("array"); });',
  ],
});

const F = "17. Forecast & Configuration Search";
const forecastBody = {
  groups: [{ id: "postman-group", age: 3, capacity: 12 }],
  ages: [{ code: "AGE_3", age: 3, demand: 10, tariffMinor: 1390800 }],
  discountMix: [{ basisPoints: 0, shareBasisPoints: 10000 }],
  staff: [
    { groupId: "postman-group", positionCode: "EDUCATOR", salaryMinor: 600000 },
    {
      groupId: "postman-group",
      positionCode: "ASSISTANT",
      salaryMinor: 400000,
    },
  ],
  rentMinor: 100000,
  otherCosts: [{ code: "OTHER", amountMinor: 50000 }],
  foodCostMinor: 10000,
};
add(F, {
  name: "Forecast scenario",
  method: "POST",
  url: "/api/v1/finance/scenarios/forecast",
  body: forecastBody,
  tests: [
    'pm.test("Forecast is complete", function () { pm.expect(responseJson.data.resultMinor).to.be.a("number"); });',
  ],
});
add(F, {
  name: "Breakeven scenario",
  method: "POST",
  url: "/api/v1/finance/scenarios/breakeven",
  body: { scenario: forecastBody, maxCandidates: 100 },
  tests: [
    'pm.test("Breakeven scan reports checked candidates", function () { pm.expect(responseJson.data.candidatesChecked).to.be.a("number"); });',
  ],
});
add(F, {
  name: "Compare configurations",
  method: "POST",
  url: "/api/v1/finance/scenarios/compare-configurations",
  body: {
    weekStart: "{{publishedWeek}}",
    schoolYear: "{{schoolYear}}",
    groupRanges: [
      { ageCode: "AGE_3", age: 3, children: 2, minGroups: 1, maxGroups: 2 },
    ],
    rooms: [{ id: "room-1", active: true, roomType: "GROUP", capacity: 2 }],
    teacherVariants: [
      {
        id: "variant-a",
        teachers: [
          {
            id: "teacher-a",
            subjectCode: "MATH",
            availability: [
              { weekday: 1, startTime: "09:00", endTime: "17:00" },
            ],
          },
        ],
      },
    ],
    program: [{ subjectCode: "MATH", sessionsPerWeek: 1, durationMinutes: 30 }],
    fixedStaff: [],
    financial: {
      ages: [{ code: "AGE_3", age: 3, demand: 2, tariffMinor: 10000000 }],
      discountMix: [{ basisPoints: 0, shareBasisPoints: 10000 }],
      rentMinor: 0,
      otherCosts: [],
      foodCostMinor: 0,
    },
  },
  tests: [
    'pm.test("Configuration search checked candidates", function () { pm.expect(responseJson.data.budget.candidatesChecked).to.be.a("number"); });',
  ],
});

const SEC = "18. Security & Permissions";
add(SEC, {
  name: "Missing JWT is rejected",
  url: "/api/v1/groups",
  auth: "none",
  expected: [401],
});
add(SEC, {
  name: "Forged JWT is rejected",
  url: "/api/v1/groups",
  auth: "forged",
  expected: [401],
});
add(SEC, {
  name: "PARENT sees only own children",
  url: "/api/v1/children?page=1&pageSize=100",
  auth: "parent",
  tests: [
    'pm.test("Parent child list is scoped", function () { pm.expect(responseJson.data.children).to.be.an("array").that.is.not.empty; });',
    'pm.environment.set("parentChildId", responseJson.data.children[0].id);',
  ],
});
add(SEC, {
  name: "PARENT reads own child",
  url: "/api/v1/children/{{parentChildId}}",
  auth: "parent",
  tests: [
    'pm.test("Own child is visible", function () { pm.expect(responseJson.data.id).to.eql(pm.environment.get("parentChildId")); });',
  ],
});
add(SEC, {
  name: "PARENT cannot read employees",
  url: "/api/v1/people/employees",
  auth: "parent",
  expected: [403],
});
add(SEC, {
  name: "PARENT cannot read finance list",
  url: "/api/v1/invoices?month={{currentMonth}}",
  auth: "parent",
  expected: [403],
});
add(SEC, {
  name: "PARENT cannot create groups",
  method: "POST",
  url: "/api/v1/groups",
  auth: "parent",
  body: { name: "Forbidden", ageCategory: 2, capacity: 10 },
  expected: [403],
});
add(SEC, {
  name: "PARENT cannot change managed child status",
  method: "PATCH",
  url: "/api/v1/children/{{parentChildId}}",
  auth: "parent",
  body: { status: "LEFT" },
  expected: [400],
});

const ERR = "19. Error Handling";
add(ERR, {
  name: "Invalid pagination",
  url: "/api/v1/groups?page=0",
  expected: [400],
});
add(ERR, {
  name: "Missing group",
  url: "/api/v1/groups/ffffffffffffffffffffffff",
  expected: [404],
});
add(ERR, {
  name: "Invalid child DOB",
  method: "POST",
  url: "/api/v1/children",
  body: { firstName: "Bad", lastName: "DOB", dateOfBirth: "2999-01-01" },
  expected: [422],
});
add(ERR, {
  name: "Invalid money is rejected",
  method: "POST",
  url: "/api/v1/expenses",
  body: {
    category: "OTHER",
    amountCents: -1,
    serviceMonth: "{{currentMonth}}",
    reason: "Invalid negative amount",
  },
  expected: [400],
});
add(ERR, {
  name: "Unknown route",
  url: "/api/v1/does-not-exist",
  expected: [404],
});
add(ERR, {
  name: "Login rate limit reaches 429",
  method: "POST",
  url: "/api/v1/auth/login",
  auth: "none",
  body: { email: "{{adminEmail}}", password: "rate-limit-probe-wrong" },
  expected: [401, 429],
  tests: [
    'const attempt = Number(pm.environment.get("rateLimitAttempt") || 0) + 1; pm.environment.set("rateLimitAttempt", attempt);',
    'if (pm.response.code !== 429 && attempt < 15) { pm.execution.setNextRequest(pm.info.requestName); } else { pm.environment.unset("rateLimitAttempt"); }',
    'pm.test("Rate limiter eventually returns 429", function () { if (attempt >= 10 || pm.response.code === 429) pm.expect(pm.response.code).to.eql(429); else pm.expect(pm.response.code).to.eql(401); });',
  ],
});

const Z = "20. Complete End-to-End Scenario";
add(Z, {
  name: "E2E 01 Create child with legal guardian",
  method: "POST",
  url: "/api/v1/children",
  body: {
    firstName: "E2E",
    lastName: "Postman {{testRunId}}",
    dateOfBirth: "{{e2eDob}}",
    guardians: [{ personId: "{{parentId}}", relationship: "MOTHER" }],
  },
  expected: [201],
  tests: [
    'pm.environment.set("e2eChildId", responseJson.data.id);',
    'pm.test("New child is APPLICANT", function () { pm.expect(responseJson.data.status).to.eql("APPLICANT"); });',
  ],
});
add(Z, {
  name: "E2E 02 Enroll child",
  method: "POST",
  url: "/api/v1/children/{{e2eChildId}}/enroll",
  body: { groupId: "{{emptyGroupId}}" },
  tests: [
    'pm.test("Child is ACTIVE", function () { pm.expect(responseJson.data.status).to.eql("ACTIVE"); pm.expect(responseJson.data.groupId).to.eql(pm.environment.get("emptyGroupId")); });',
  ],
});
add(Z, {
  name: "E2E 03 Verify occupied seats",
  url: "/api/v1/groups/{{emptyGroupId}}",
  tests: [
    'pm.test("Occupied seats increased", function () { pm.expect(responseJson.data.occupiedSeats).to.be.above(0); });',
  ],
});
add(Z, {
  name: "E2E 04 Suspend",
  method: "POST",
  url: "/api/v1/children/{{e2eChildId}}/suspend",
  tests: [
    'pm.test("Child is SUSPENDED", function () { pm.expect(responseJson.data.status).to.eql("SUSPENDED"); });',
  ],
});
add(Z, {
  name: "E2E 05 Resume",
  method: "POST",
  url: "/api/v1/children/{{e2eChildId}}/resume",
  tests: [
    'pm.test("Child is ACTIVE again", function () { pm.expect(responseJson.data.status).to.eql("ACTIVE"); });',
  ],
});
add(Z, {
  name: "E2E 06 Assign benefit",
  method: "POST",
  url: "/api/v1/children/{{e2eChildId}}/benefits",
  body: { benefitCode: "BENEFIT_10", startMonth: "{{nextMonth}}" },
  tests: [
    'pm.test("Benefit snapshot is visible", function () { pm.expect(responseJson.data.benefitAssignments).to.be.an("array").that.is.not.empty; pm.expect(responseJson.data.benefitAssignments[0].benefitCode).to.eql("BENEFIT_10"); });',
  ],
});
add(Z, {
  name: "E2E 07 Create annual tuition invoice",
  method: "POST",
  url: "/api/v1/invoices/children/{{e2eChildId}}/annual-tuition",
  body: { firstMonth: "{{nextMonth}}" },
  expected: [201],
  tests: [
    'pm.environment.set("e2eInvoiceId", responseJson.data.id); pm.environment.set("e2eInvoiceAmount", responseJson.data.origAmountCents);',
    'pm.test("Annual invoice has exact integer total", function () { pm.expect(responseJson.data.origAmountCents).to.be.a("number").and.above(0); });',
  ],
});
add(Z, {
  name: "E2E 08 Parent reports PENDING payment",
  method: "POST",
  url: "/api/v1/payments",
  auth: "parent",
  body: '{"invoiceId":"{{e2eInvoiceId}}","amountCents":{{e2eInvoiceAmount}},"method":"BANK_TRANSFER","idempotencyKey":"postman-e2e-payment-{{testRunId}}"}',
  expected: [201],
  tests: [
    'pm.environment.set("e2ePaymentId", responseJson.data.id);',
    'pm.test("Payment remains pending before review", function () { pm.expect(responseJson.data.status).to.eql("PENDING"); });',
  ],
});
add(Z, {
  name: "E2E 09 ADMIN confirms payment",
  method: "POST",
  url: "/api/v1/payments/{{e2ePaymentId}}/confirm",
  body: { occurredAt: "{{$isoTimestamp}}" },
  tests: [
    'pm.test("Payment is confirmed", function () { pm.expect(responseJson.data.status).to.eql("CONFIRMED"); });',
  ],
});
add(Z, {
  name: "E2E 10 Verify paid invoice",
  url: "/api/v1/invoices/children/{{e2eChildId}}",
  tests: [
    'const paid = responseJson.data.find(function (row) { return row.id === pm.environment.get("e2eInvoiceId"); });',
    'pm.test("Invoice paid amount and balance are consistent", function () { pm.expect(paid).to.exist; pm.expect(paid.paidAmountCents).to.eql(Number(pm.environment.get("e2eInvoiceAmount"))); pm.expect(paid.remainingAmountCents).to.eql(0); pm.expect(paid.status).to.eql("PAID"); });',
  ],
});
add(Z, {
  name: "E2E 11 Verify financial report",
  url: "/api/v1/reports/finance/monthly?month={{currentMonth}}",
  tests: [
    'pm.test("Confirmed receipt is reflected", function () { pm.expect(responseJson.data.receiptsNetMinor).to.be.a("number").and.above(0); });',
  ],
});
add(Z, {
  name: "E2E 12 Verify published schedule",
  url: "/api/v1/schedules/{{draftWeek}}/published",
  tests: [
    'pm.test("Published schedule remains readable", function () { pm.expect(responseJson.data.slots).to.be.an("array").that.is.not.empty; });',
  ],
});
add(Z, {
  name: "E2E 13 Withdraw child",
  method: "POST",
  url: "/api/v1/children/{{e2eChildId}}/withdraw",
  tests: [
    'pm.environment.set("e2eRefundDue", responseJson.data.billing.refundDueCents);',
    'pm.test("Child left and refund is due", function () { pm.expect(responseJson.data.child.status).to.eql("LEFT"); pm.expect(responseJson.data.billing.refundDueCents).to.be.above(0); });',
  ],
});
add(Z, {
  name: "E2E 14 Refund confirmed payment",
  method: "POST",
  url: "/api/v1/payments/{{e2ePaymentId}}/refund",
  body: '{"amountCents":{{e2eRefundDue}},"reason":"E2E withdrawal refund","idempotencyKey":"postman-e2e-refund-{{testRunId}}"}',
  expected: [201],
  tests: [
    'pm.test("Refund is confirmed", function () { pm.expect(responseJson.data.status).to.eql("CONFIRMED"); });',
  ],
});
add(Z, {
  name: "E2E 15 Verify refund history",
  url: "/api/v1/payments/{{e2ePaymentId}}/refunds",
  tests: [
    'pm.test("Refund history contains E2E refund", function () { pm.expect(responseJson.data).to.be.an("array").that.is.not.empty; });',
  ],
});
add(Z, {
  name: "E2E 16 Final aggregation checks",
  url: "/api/v1/reports/operations/benefits?month={{currentMonth}}",
  tests: [
    'pm.test("Final report remains available", function () { pm.expect(responseJson.data.distribution).to.be.an("array"); });',
  ],
});

const dateBootstrap = [
  'const now = new Date(); const year = now.getUTCFullYear(); const month = now.getUTCMonth() + 1; const day = now.getUTCDate(); const pad = function (n) { return String(n).padStart(2, "0"); };',
  'const currentDate = year + "-" + pad(month) + "-" + pad(day); const currentMonth = year + "-" + pad(month); const schoolStart = month >= 9 ? year : year - 1;',
  "const next = month === 12 ? { y: year + 1, m: 1 } : { y: year, m: month + 1 };",
  "const utc = new Date(Date.UTC(year, month - 1, day)); const weekday = utc.getUTCDay(); const monday = new Date(utc); monday.setUTCDate(utc.getUTCDate() - ((weekday + 6) % 7)); const nextMonday = new Date(monday); nextMonday.setUTCDate(monday.getUTCDate() + 7);",
  "const iso = function (d) { return d.toISOString().slice(0, 10); };",
  'pm.environment.set("currentDate", currentDate); pm.environment.set("currentMonth", currentMonth); pm.environment.set("nextMonth", next.y + "-" + pad(next.m)); pm.environment.set("schoolYear", schoolStart + "-" + (schoolStart + 1)); pm.environment.set("publishedWeek", iso(monday)); pm.environment.set("draftWeek", iso(nextMonday)); pm.environment.set("e2eDob", (schoolStart - 2) + "-08-31");',
  'if (!pm.environment.get("testRunId")) pm.environment.set("testRunId", String(Date.now())); pm.environment.set("testSubjectCode", "POSTMAN_" + pm.environment.get("testRunId"));',
];

const collection = {
  info: {
    _postman_id: "b57ecce6-6974-4f28-8704-43e579431ac2",
    name: "Kindergarten API — Full Validation",
    description:
      "Повна виконувана колекція для фактичного API дитячого садка. Джерело маршрутів — docs/api/openapi.json. Секрети передаються тільки runtime-змінними.",
    schema:
      "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
  },
  event: [
    {
      listen: "prerequest",
      script: { type: "text/javascript", exec: dateBootstrap },
    },
  ],
  variable: [],
  item: folderNames.map((name) => folders[name]),
};

const documentedOperations = Object.values(openApi.paths).reduce(
  (count, pathItem) =>
    count +
    Object.keys(pathItem).filter((method) =>
      ["get", "post", "put", "patch", "delete"].includes(method),
    ).length,
  0,
);
const representedOperations = new Set();
for (const folder of collection.item) {
  for (const item of folder.item) {
    const url = item.request.url.replace("{{baseUrl}}", "").split("?")[0];
    const normalized = url.replace(/\{\{[^}]+\}\}/g, "{id}");
    representedOperations.add(`${item.request.method} ${normalized}`);
  }
}

const environment = {
  id: "5119452b-96c1-43e2-92cf-eed4e293edab",
  name: "Kindergarten Local",
  values: [
    ["baseUrl", "http://127.0.0.1:3000", "default"],
    ["adminEmail", "", "default"],
    ["adminPassword", "", "secret"],
    ["parentEmail", "demo.parent1@example.test", "default"],
    ["parentPassword", "", "secret"],
    ["accessToken", "", "secret"],
    ["parentToken", "", "secret"],
    ...[
      "groupId",
      "childId",
      "employeeId",
      "invoiceId",
      "paymentId",
      "scheduleId",
      "currentMonth",
      "schoolYear",
    ].map((key) => [key, "", "default"]),
  ].map(([key, value, type]) => ({ key, value, type, enabled: true })),
  _postman_variable_scope: "environment",
  _postman_exported_at: new Date(0).toISOString(),
  _postman_exported_using: "node-dots deterministic generator",
};

const postmanDirectory = path.join(root, "postman");
await mkdir(postmanDirectory, { recursive: true });
await writeFile(
  path.join(postmanDirectory, "Kindergarten_API.postman_collection.json"),
  `${JSON.stringify(collection, null, 2)}\n`,
);
await writeFile(
  path.join(postmanDirectory, "Kindergarten_Local.postman_environment.json"),
  `${JSON.stringify(environment, null, 2)}\n`,
);

const requestCount = collection.item.reduce(
  (count, folder) => count + folder.item.length,
  0,
);
console.log(
  `Postman collection generated: ${requestCount} requests in ${collection.item.length} folders; OpenAPI operations: ${documentedOperations}; request signatures: ${representedOperations.size}.`,
);
