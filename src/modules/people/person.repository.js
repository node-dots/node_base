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

  const result = {
    positionCode: employee.positionCode,
    status: employee.status,
    salaryMinor: employee.salaryMinor,
  };
  if (employee.subjectCode !== undefined)
    result.subjectCode = employee.subjectCode;
  return result;
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

  async findAccountByEmail(email, { session } = {}) {
    let query = this.personModel.findOne({ "account.email": email });
    if (session) query = query.session(session);
    const document = await query.lean();
    return document ? toPerson(document) : null;
  }

  async findAccountById(personId, { session } = {}) {
    if (!mongoose.isObjectIdOrHexString(personId)) return null;

    let query = this.personModel.findOne({
      _id: personId,
      "account.email": { $type: "string" },
    });
    if (session) query = query.session(session);
    const document = await query.lean();
    return document ? toPerson(document) : null;
  }

  async findFirstEnabledAdmin() {
    const document = await this.personModel
      .findOne({ "account.roles": "ADMIN", "account.enabled": true })
      .lean();
    return document ? toPerson(document) : null;
  }

  async countEnabledAdmins({ session } = {}) {
    let query = this.personModel.countDocuments({
      "account.roles": "ADMIN",
      "account.enabled": true,
    });
    if (session) query = query.session(session);
    return query;
  }

  async updateAccountRoles(
    { personId, roles, expectedTokenVersion },
    { session } = {},
  ) {
    const document = await this.personModel
      .findOneAndUpdate(
        {
          _id: personId,
          "account.email": { $type: "string" },
          "account.tokenVersion": expectedTokenVersion,
        },
        {
          $set: { "account.roles": roles },
          $inc: { "account.tokenVersion": 1 },
        },
        { new: true, runValidators: true, session },
      )
      .lean();
    return document ? toPerson(document) : null;
  }

  async advanceAccountTokenVersion(
    { personId, expectedTokenVersion, passwordHash },
    { session } = {},
  ) {
    let query = this.personModel.findOneAndUpdate(
      {
        _id: personId,
        "account.enabled": true,
        "account.tokenVersion": expectedTokenVersion,
      },
      {
        $inc: { "account.tokenVersion": 1 },
        ...(passwordHash
          ? { $set: { "account.passwordHash": passwordHash } }
          : {}),
      },
      { new: true, runValidators: true, session },
    );
    const document = await query.lean();
    return document ? toPerson(document) : null;
  }
}
