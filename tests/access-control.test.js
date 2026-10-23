import test from "node:test";
import assert from "node:assert/strict";
import { makeAuthorizer } from "../src/modules/people/access/makeAuthorizer.js";
import { authorizer } from "../src/modules/people/access/authorizer.js";
import { rolePermissions } from "../src/modules/people/access/rolePermissions.js";
import { ROLES } from "../src/utils/access/roles.js";
import { PERMISSIONS } from "../src/utils/access/permissions.js";
import {
  GroupAccessPolicy,
  groupScopeFilter,
} from "../src/modules/groups/groupAccessPolicy.js";
import {
  ChildAccessPolicy,
  childScopeFilter,
} from "../src/modules/children/childAccessPolicy.js";
import { ChildViewPolicy } from "../src/modules/children/childViewPolicy.js";
import { AccountRolesService } from "../src/modules/people/accountRoles.service.js";

test("authorizer validates complete role configuration and denies unknown codes", () => {
  assert.equal(Object.keys(rolePermissions).length, Object.keys(ROLES).length);
  assert.equal(
    authorizer.hasPermission(
      { id: "p1", roles: ["UNKNOWN"] },
      PERMISSIONS.GROUPS_READ,
    ),
    false,
  );
  assert.equal(
    authorizer.hasPermission(
      { id: "p1", roles: [ROLES.PARENT] },
      PERMISSIONS.GROUPS_CREATE,
    ),
    false,
  );
  assert.equal(
    authorizer.hasPermission(
      { id: "p1", roles: [ROLES.ADMIN] },
      PERMISSIONS.ROLES_ASSIGN,
    ),
    true,
  );
  assert.throws(
    () => authorizer.assertKnown("groups:reed"),
    /Невідомий дозвіл/,
  );
  assert.throws(
    () =>
      makeAuthorizer({
        roles: { USER: "USER" },
        permissions: { READ: "read" },
        rolePermissions: { USER: ["missing"] },
      }),
    /Невідомий дозвіл/,
  );
  assert.throws(
    () =>
      makeAuthorizer({
        roles: { USER: "USER" },
        permissions: { READ: "read" },
        rolePermissions: {},
      }),
    /Відсутні налаштування ролі/,
  );
});

test("group and child scope merges parent and assigned-group access and fails closed", async () => {
  const ownGroup = "000000000000000000000001";
  const workGroup = "000000000000000000000002";
  const groupReader = {
    async findActiveGroupIds() {
      return [workGroup];
    },
  };
  const guardianReader = {
    async findActiveGroupIds() {
      return [ownGroup];
    },
  };
  const actor = {
    id: "000000000000000000000003",
    roles: [ROLES.PARENT, ROLES.EDUCATOR],
  };

  const groupScope = await new GroupAccessPolicy({
    groupAssignmentsReader: groupReader,
    guardianGroupsReader: guardianReader,
  }).readScope(actor);
  assert.deepEqual(groupScope, {
    kind: "RELATED",
    groupIds: [ownGroup, workGroup],
  });
  assert.deepEqual(
    await new ChildAccessPolicy({
      groupAssignmentsReader: groupReader,
    }).readScope(actor),
    { kind: "RELATED", guardianId: actor.id, groupIds: [workGroup] },
  );
  assert.deepEqual(groupScopeFilter({ kind: "RELATED", groupIds: [] }), {
    _id: { $in: [] },
  });
  assert.deepEqual(
    childScopeFilter({ kind: "RELATED", guardianId: null, groupIds: [] }),
    { _id: { $in: [] } },
  );
  assert.deepEqual(
    groupScopeFilter({ kind: "RELATED", groupIds: ["invalid"] }),
    { _id: { $in: [] } },
  );
  assert.throws(
    () => groupScopeFilter({ kind: "RELATED", groupIds: null }),
    /область доступу/,
  );
});

test("PARENT+EDUCATOR receives the educator view for another child's record", () => {
  const policy = new ChildViewPolicy({ authorizer });
  const actor = { id: "person-parent", roles: [ROLES.PARENT, ROLES.EDUCATOR] };
  const child = {
    id: "child-1",
    firstName: "Олена",
    lastName: "Приклад",
    status: "ACTIVE",
    groupId: "group-1",
    guardians: [{ personId: "someone-else" }],
    relatives: [{ name: "Родич", contact: "private" }],
    food: {
      exclusions: ["горіхи"],
      allergyNotes: ["алергія"],
      note: "private",
    },
    benefitCode: "BENEFIT-SECRET",
  };
  assert.deepEqual(policy.toReadDto(child, actor), {
    id: "child-1",
    firstName: "Олена",
    lastName: "Приклад",
    middleName: undefined,
    dateOfBirth: undefined,
    status: "ACTIVE",
    groupId: "group-1",
    food: { exclusions: ["горіхи"], allergyNotes: ["алергія"] },
  });
  assert.equal(
    policy.toReadDto({ ...child, guardians: [{ personId: actor.id }] }, actor)
      .benefitCode,
    "BENEFIT-SECRET",
  );
  assert.throws(
    () => policy.toReadDto(child, { id: "teacher", roles: [ROLES.TEACHER] }),
    { status: 403 },
  );
});

test("account role commands authorize direct calls and audit changes transactionally", async () => {
  let audited;
  let ensured = false;
  let bumped = false;
  const account = {
    id: "000000000000000000000010",
    account: { roles: [ROLES.MANAGER], enabled: true, tokenVersion: 2 },
  };
  const service = new AccountRolesService({
    authorizer,
    personRepository: {
      async findAccountById() {
        return structuredClone(account);
      },
      async countEnabledAdmins() {
        return 2;
      },
      async updateAccountRoles({ roles }) {
        account.account.roles = [...roles];
        account.account.tokenVersion += 1;
        return structuredClone(account);
      },
    },
    settingsRepository: {
      async ensureAdminGuard() {
        ensured = true;
      },
      async incrementAdminGuard() {
        bumped = true;
      },
    },
    unitOfWork: {
      async execute(operation) {
        return operation({
          session: {},
          recordAudit: async (event) => {
            audited = event;
          },
        });
      },
    },
  });
  const admin = { id: "admin-1", roles: [ROLES.ADMIN] };
  await assert.rejects(
    service.assign(
      { personId: account.id, roles: [ROLES.PARENT] },
      { id: "user", roles: [ROLES.PARENT] },
      "request-1",
    ),
    { status: 403 },
  );
  const result = await service.assign(
    { personId: account.id, roles: [ROLES.PARENT] },
    admin,
    "request-2",
  );
  assert.deepEqual(result, { personId: account.id, roles: [ROLES.PARENT] });
  assert.equal(ensured, true);
  assert.equal(bumped, true);
  assert.deepEqual(audited.before, { roles: [ROLES.MANAGER] });
  assert.deepEqual(audited.after, { roles: [ROLES.PARENT] });
  assert.deepEqual(audited.safeFields, ["roles"]);
});

test("removing the last active ADMIN is rejected", async () => {
  const adminPerson = {
    id: "admin-2",
    account: { roles: [ROLES.ADMIN], enabled: true, tokenVersion: 0 },
  };
  const service = new AccountRolesService({
    authorizer,
    personRepository: {
      async findAccountById() {
        return adminPerson;
      },
      async countEnabledAdmins() {
        return 1;
      },
      async updateAccountRoles() {
        assert.fail("must preserve final admin");
      },
    },
    settingsRepository: {
      async ensureAdminGuard() {},
      async incrementAdminGuard() {},
    },
    unitOfWork: {
      async execute(operation) {
        return operation({ session: {}, recordAudit: async () => {} });
      },
    },
  });
  await assert.rejects(
    service.assign(
      { personId: adminPerson.id, roles: [ROLES.PARENT] },
      { id: "admin-2", roles: [ROLES.ADMIN] },
      "req",
    ),
    { status: 409, code: "LAST_ADMIN_REQUIRED" },
  );
});

test("teacher role requires one active discipline in the employee profile", async () => {
  const person = {
    id: "teacher-1",
    employee: {
      positionCode: "TEACHER",
      status: "ACTIVE",
      subjectCode: "MUSIC",
    },
    account: { roles: [ROLES.PARENT], enabled: true, tokenVersion: 0 },
  };
  let updateCalls = 0;
  const service = new AccountRolesService({
    authorizer,
    personRepository: {
      async findAccountById() {
        return person;
      },
      async countEnabledAdmins() {
        return 1;
      },
      async updateAccountRoles() {
        updateCalls += 1;
        return person;
      },
    },
    settingsRepository: {
      async ensureAdminGuard() {},
      async incrementAdminGuard() {},
      async findActiveByCode() {
        return null;
      },
    },
    unitOfWork: {
      async execute(operation) {
        return operation({ session: {}, recordAudit: async () => {} });
      },
    },
  });
  await assert.rejects(
    service.assign(
      { personId: person.id, roles: [ROLES.TEACHER] },
      { id: "admin", roles: [ROLES.ADMIN] },
      "request-teacher",
    ),
    { code: "EMPLOYEE_PROFILE_REQUIRED" },
  );
  assert.equal(updateCalls, 0);
});
