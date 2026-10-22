import mongoose from "mongoose";

function toAccount(account) {
  if (!account) {
    return undefined;
  }

  return {
    email: account.email,
    passwordHash: account.passwordHash,
    roles: [...account.roles],
    enabled: account.enabled,
    tokenVersion: account.tokenVersion,
  };
}

function toEmployee(employee) {
  if (!employee) {
    return undefined;
  }

  return {
    positionCode: employee.positionCode,
    status: employee.status,
    salaryMinor: employee.salaryMinor,
  };
}

// Явно визначаємо внутрішні поля, які повертає репозиторій.
function toPerson(document) {
  const person = {
    id: document._id.toString(),
    firstName: document.firstName,
    lastName: document.lastName,
    middleName: document.middleName,
    phone: document.phone,
    status: document.status,
  };

  if (document.account) {
    person.account = toAccount(document.account);
  }

  if (document.employee) {
    person.employee = toEmployee(document.employee);
  }

  return person;
}

export class PersonRepository {
  constructor({ personModel }) {
    this.personModel = personModel;
  }

  async insert(person) {
    const document = await this.personModel.create(person);

    return toPerson(document);
  }

  async findById(personId) {
    if (!mongoose.isObjectIdOrHexString(personId)) {
      return null;
    }

    const document = await this.personModel.findById(personId).lean();

    return document ? toPerson(document) : null;
  }
}
