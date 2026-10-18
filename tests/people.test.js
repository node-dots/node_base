import test from "node:test";
import assert from "node:assert/strict";
import { PersonService } from "../src/modules/people/person.service.js";
import { toPersonDto } from "../src/modules/people/person.dto.js";
import { createPersonSchema } from "../src/modules/people/person.schema.js";
import {
  PERSON_STATUS,
  PERSON_LIMITS,
  PERSON_ERROR_CODES,
} from "../src/modules/people/person.constants.js";
import { BusinessError, ResourceNotFoundError } from "../src/utils/errors.js";

test("Створення людини нормалізує поля та дозволяє прочитати профіль", async () => {
  let savedPerson;

  // Тестове сховище для одного запису, без підключення MongoDB.
  const personRepository = {
    async insert(person) {
      savedPerson = {
        ...structuredClone(person),
        id: "000000000000000000000001",
      };

      return structuredClone(savedPerson);
    },

    async findById(id) {
      return savedPerson?.id === id ? structuredClone(savedPerson) : null;
    },
  };

  const service = new PersonService({ personRepository });

  const person = await service.createPerson({
    firstName: " Олена ",
    lastName: " Коваль ",
    middleName: " Іванівна ",
    phone: " +380501234567 ",
  });

  assert.deepEqual(person, {
    id: "000000000000000000000001",
    firstName: "Олена",
    lastName: "Коваль",
    middleName: "Іванівна",
    phone: "+380501234567",
    status: PERSON_STATUS.ACTIVE,
  });

  assert.deepEqual(await service.getPerson(person.id), person);

  // Зміна отриманого профілю не змінює збережені дані.
  person.firstName = "Змінено";

  assert.equal((await service.getPerson(person.id)).firstName, "Олена");
});

test("Некоректні дані відхиляються до звернення до сховища", async () => {
  let insertCalls = 0;

  const personRepository = {
    async insert() {
      insertCalls += 1;
    },
  };

  const service = new PersonService({ personRepository });

  const validInput = {
    firstName: "Олена",
    lastName: "Коваль",
  };

  for (const changes of [
    { firstName: "   " },
    { firstName: 123 },
    { lastName: undefined },
    { lastName: "а".repeat(PERSON_LIMITS.MAX_NAME_LENGTH + 1) },
    { middleName: "" },
    { phone: 123456 },
    { phone: "1".repeat(PERSON_LIMITS.MAX_PHONE_LENGTH + 1) },
  ]) {
    await assert.rejects(
      service.createPerson({ ...validInput, ...changes }),
      (error) => {
        assert.ok(error instanceof BusinessError);
        assert.equal(error.code, PERSON_ERROR_CODES.INVALID_FIELD);
        return true;
      },
    );
  }

  assert.equal(insertCalls, 0);
});

test("Відсутня людина повертає помилку PERSON_NOT_FOUND", async () => {
  const personRepository = {
    async findById() {
      return null;
    },
  };

  const service = new PersonService({ personRepository });

  await assert.rejects(
    service.getPerson("000000000000000000000099"),
    (error) => {
      assert.ok(error instanceof ResourceNotFoundError);
      assert.equal(error.code, PERSON_ERROR_CODES.NOT_FOUND);
      return true;
    },
  );
});

test("Людина створюється без контактів та облікового запису", async () => {
  let savedPerson;

  const personRepository = {
    async insert(person) {
      savedPerson = structuredClone(person);

      return {
        ...person,
        id: "000000000000000000000002",
      };
    },
  };

  const service = new PersonService({ personRepository });

  const person = await service.createPerson({
    firstName: "Андрій",
    lastName: "Мельник",
    status: PERSON_STATUS.INACTIVE,
    account: {
      roles: ["ADMIN"],
    },
  });

  assert.equal(person.firstName, "Андрій");
  assert.equal(person.lastName, "Мельник");
  assert.equal(person.middleName, undefined);
  assert.equal(person.phone, undefined);
  assert.equal(savedPerson.status, PERSON_STATUS.ACTIVE);
  assert.equal(Object.hasOwn(savedPerson, "account"), false);
});

test("DTO людини не розкриває облікові та зарплатні дані", () => {
  const dto = toPersonDto({
    id: "000000000000000000000001",
    firstName: "Олена",
    lastName: "Коваль",
    status: PERSON_STATUS.ACTIVE,
    account: {
      passwordHash: "test-hash",
      tokenVersion: 3,
      roles: ["ADMIN"],
    },
    employee: {
      salaryMinor: 4000000,
    },
  });

  assert.deepEqual(dto, {
    id: "000000000000000000000001",
    firstName: "Олена",
    lastName: "Коваль",
    middleName: undefined,
    phone: undefined,
    status: PERSON_STATUS.ACTIVE,
  });
});

test("Схема створення людини нормалізує поля та дозволяє пропустити контакти", () => {
  const result = createPersonSchema.parse({
    firstName: " Олена ",
    lastName: " Коваль ",
  });

  assert.deepEqual(result, {
    firstName: "Олена",
    lastName: "Коваль",
  });
});

test("Схема створення людини відхиляє некоректні та зайві поля", () => {
  const validInput = {
    firstName: "Олена",
    lastName: "Коваль",
  };

  for (const changes of [
    { firstName: " " },
    { lastName: undefined },
    { phone: 123 },
    { middleName: "" },
    { status: PERSON_STATUS.INACTIVE },
    { account: { roles: ["ADMIN"] } },
    { employee: {} },
  ]) {
    const result = createPersonSchema.safeParse({
      ...validInput,
      ...changes,
    });

    assert.equal(result.success, false, JSON.stringify(changes));
  }
});
