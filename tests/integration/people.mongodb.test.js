import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import mongoose from "mongoose";
import { PersonModel } from "../../src/modules/people/person.model.js";
import { PersonRepository } from "../../src/modules/people/person.repository.js";
import { PersonService } from "../../src/modules/people/person.service.js";
import {
  ACCOUNT_ROLE,
  EMPLOYEE_STATUS,
  PERSON_STATUS,
} from "../../src/modules/people/person.constants.js";

test(
  "MongoDB: створення та читання людей без облікових записів",
  {
    skip: process.env.RUN_MONGO_TESTS !== "true",
  },
  async () => {
    // Окрема випадкова база: дані розробки не зачіпаємо.
    const databaseName = `kindergarten_test_${randomUUID().replaceAll("-", "")}`;

    const connection = await mongoose
      .createConnection(
        "mongodb://127.0.0.1:27017/?replicaSet=rs0&directConnection=true",
        {
          dbName: databaseName,
          serverSelectionTimeoutMS: 5000,
        },
      )
      .asPromise();

    try {
      const model = connection.model("Person", PersonModel.schema);
      const repository = new PersonRepository({ personModel: model });
      const service = new PersonService({
        personRepository: repository,
      });

      const input = {
        firstName: " Олена ",
        lastName: " Коваль ",
      };

      const first = await service.createPerson(input);
      const second = await service.createPerson(input);

      // Однакові імена не означають, що це одна людина.
      assert.notEqual(first.id, second.id);
      assert.equal(await model.countDocuments(), 2);

      assert.equal(first.firstName, "Олена");
      assert.equal(first.lastName, "Коваль");
      assert.equal(first.phone, undefined);
      assert.equal(Object.hasOwn(first, "account"), false);

      // Репозиторій повертає звичайний об’єкт зі строковим ID.
      assert.match(first.id, /^[a-f0-9]{24}$/);
      assert.equal(first._id, undefined);
      assert.equal(typeof first.save, "undefined");

      assert.deepEqual(await repository.findById(first.id), first);

      assert.equal(await repository.findById("invalid-id"), null);
      assert.equal(await repository.findById("ffffffffffffffffffffffff"), null);
    } finally {
      try {
        await connection.dropDatabase();
      } finally {
        await connection.close();
      }
    }
  },
);

test(
  "MongoDB: account email унікальний після нормалізації, а людина підтримує кілька ролей",
  {
    skip: process.env.RUN_MONGO_TESTS !== "true",
  },
  async () => {
    const databaseName = `kindergarten_test_${randomUUID().replaceAll("-", "")}`;
    const connection = await mongoose
      .createConnection(
        "mongodb://127.0.0.1:27017/?replicaSet=rs0&directConnection=true",
        {
          dbName: databaseName,
          serverSelectionTimeoutMS: 5000,
        },
      )
      .asPromise();

    try {
      const model = connection.model("Person", PersonModel.schema);
      await model.init();
      const repository = new PersonRepository({ personModel: model });

      const first = await repository.insert({
        firstName: "Олена",
        lastName: "Коваль",
        status: PERSON_STATUS.ACTIVE,
        account: {
          email: "  USER@EXAMPLE.COM ",
          passwordHash: "test-password-hash",
          roles: [ACCOUNT_ROLE.ADMIN, ACCOUNT_ROLE.MANAGER],
          enabled: true,
          tokenVersion: 0,
        },
        employee: {
          positionCode: "MANAGER",
          status: EMPLOYEE_STATUS.ACTIVE,
          salaryMinor: 4000000,
        },
      });

      assert.equal(first.account.email, "user@example.com");
      assert.deepEqual(first.account.roles, ["ADMIN", "MANAGER"]);
      assert.equal(first.employee.salaryMinor, 4000000);
      assert.deepEqual(await repository.findById(first.id), first);

      await assert.rejects(
        repository.insert({
          firstName: "Іван",
          lastName: "Петренко",
          status: PERSON_STATUS.ACTIVE,
          account: {
            email: "user@example.com",
            passwordHash: "another-password-hash",
            roles: [ACCOUNT_ROLE.PARENT],
            enabled: true,
            tokenVersion: 0,
          },
        }),
        (error) => error?.code === 11000,
      );

      assert.equal(await model.countDocuments(), 1);
    } finally {
      try {
        await connection.dropDatabase();
      } finally {
        await connection.close();
      }
    }
  },
);
