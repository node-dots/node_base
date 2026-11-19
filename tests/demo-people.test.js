import test from "node:test";
import assert from "node:assert/strict";
import {
  ensureDemoParents,
  demoParentFixtures,
} from "../scripts/demo-people.js";

test("demo parent provisioning is repeatable and leaves existing accounts intact", async () => {
  const people = new Map();
  let nextId = 1;
  const personRepository = {
    async findAccountByEmail(email) {
      return (
        [...people.values()].find((person) => person.account.email === email) ??
        null
      );
    },
    async insert(person) {
      const created = { ...person, id: String(nextId++) };
      people.set(created.account.email, created);
      return created;
    },
  };
  const unitOfWork = {
    async execute(callback) {
      return callback({
        session: {},
        async recordAudit() {},
      });
    },
  };
  const hasher = {
    async hash(value) {
      return `test-hash:${value}`;
    },
  };
  const options = {
    personRepository,
    unitOfWork,
    password: "demo-password-for-tests",
    hasher,
    actorId: "admin-fixture",
  };

  const first = await ensureDemoParents(options);
  const original = await personRepository.findAccountByEmail(
    demoParentFixtures[0].email,
  );
  original.firstName = "Manually edited";
  const second = await ensureDemoParents(options);

  assert.equal(first.length, 2);
  assert.equal(
    first.every((parent) => parent.created),
    true,
  );
  assert.equal(
    second.every((parent) => !parent.created),
    true,
  );
  assert.equal(people.size, 2);
  assert.equal(original.firstName, "Manually edited");
  assert.equal(
    original.account.passwordHash,
    "test-hash:demo-password-for-tests",
  );
});

test("demo parent provisioning requires a password from the environment or caller", async () => {
  await assert.rejects(
    ensureDemoParents({
      personRepository: {},
      unitOfWork: {},
      password: "",
      actorId: "admin-fixture",
    }),
    /DEMO_PARENT_PASSWORD/,
  );
});
