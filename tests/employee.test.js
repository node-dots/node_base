import test from "node:test";
import assert from "node:assert/strict";
import { EmployeeService } from "../src/modules/people/employee.service.js";
import { employeeProfileSchema } from "../src/modules/people/employee.schema.js";
import { authorizer } from "../src/modules/people/access/authorizer.js";
import { toEmployeeProfileDto } from "../src/modules/people/person.dto.js";

const personId = "507f1f77bcf86cd799439011";
const employee = {
  positionCode: "TEACHER",
  status: "ACTIVE",
  startedAt: "2024-01-01",
  salaryMinor: 4000000,
  subjectCode: "MUSIC",
  availability: [],
};
const initialPerson = {
  id: personId,
  firstName: "A",
  lastName: "B",
  status: "ACTIVE",
  account: { enabled: false },
  employee,
};

test("employee profile requires an active teacher subject and consistent employment dates", () => {
  assert.throws(() =>
    employeeProfileSchema.parse({ ...employee, subjectCode: undefined }),
  );
  assert.throws(() =>
    employeeProfileSchema.parse({
      ...employee,
      positionCode: "EDUCATOR",
      subjectCode: "MUSIC",
    }),
  );
  assert.throws(() =>
    employeeProfileSchema.parse({ ...employee, status: "TERMINATED" }),
  );
  assert.throws(() =>
    employeeProfileSchema.parse({
      ...employee,
      availability: [
        { weekday: 1, startTime: "09:00", endTime: "10:00" },
        { weekday: 1, startTime: "09:45", endTime: "11:00" },
      ],
    }),
  );
});

test("employee DTO hides salary except for ADMIN and does not expose account state", () => {
  const manager = toEmployeeProfileDto(initialPerson, false);
  const admin = toEmployeeProfileDto(initialPerson, true);
  assert.equal("salaryMinor" in manager.employee, false);
  assert.equal(admin.employee.salaryMinor, 4000000);
  assert.equal("account" in admin, false);
});

function makeService({ assignments = [] } = {}) {
  const events = [];
  let stored = structuredClone(initialPerson);
  return {
    events,
    service: new EmployeeService({
      personRepository: {
        findById: async () => structuredClone(stored),
        updateEmployee: async (_id, value) => {
          stored.employee = structuredClone(value);
          return structuredClone(stored);
        },
      },
      catalogRepository: {
        findActiveByCode: async (kind, code) =>
          kind === "POSITION" && code === "TEACHER"
            ? { active: true }
            : kind === "SUBJECT" && code === "MUSIC"
              ? { active: true }
              : null,
        ensureEmployeeResourceGuard: async () => {},
        incrementEmployeeResourceGuard: async () => {},
      },
      groupRepository: {
        findActiveEmployeeAssignments: async () => assignments,
      },
      unitOfWork: {
        execute: async (operation) =>
          operation({
            session: {},
            recordAudit: async (event) => events.push(event),
          }),
      },
      authorizer,
    }),
  };
}

test("manager cannot read or change salary; staff self-service is limited to availability", async () => {
  const { service } = makeService();
  const manager = { id: "507f1f77bcf86cd799439012", roles: ["MANAGER"] };
  await assert.rejects(
    () => service.update(personId, { salaryMinor: 1 }, manager, "req"),
    { code: "EMPLOYEE_FIELD_FORBIDDEN" },
  );
  const teacher = { id: personId, roles: ["TEACHER"] };
  await assert.rejects(
    () => service.update(personId, { status: "ON_LEAVE" }, teacher, "req"),
    { code: "EMPLOYEE_FIELD_FORBIDDEN" },
  );
});

test("active group assignment blocks employee termination and valid update is audited", async () => {
  const blocked = makeService({ assignments: [{ id: "group" }] }).service;
  await assert.rejects(
    () =>
      blocked.update(
        personId,
        { status: "TERMINATED", endedAt: "2026-10-24" },
        { id: "507f1f77bcf86cd799439012", roles: ["ADMIN"] },
        "req",
      ),
    { code: "EMPLOYEE_ASSIGNED_TO_ACTIVE_GROUP" },
  );
  const setup = makeService();
  await setup.service.update(
    personId,
    { availability: [{ weekday: 1, startTime: "09:00", endTime: "12:00" }] },
    { id: personId, roles: ["TEACHER"] },
    "req",
  );
  assert.equal(setup.events[0].after.employeeProfileUpdated, true);
  assert.equal(setup.events[0].safeFields[0], "employeeProfileUpdated");
});
