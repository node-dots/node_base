import mongoose from "mongoose";

// Явно визначаємо поля, які повертає репозиторій.
function toPerson(document) {
  return {
    id: document._id.toString(),
    firstName: document.firstName,
    lastName: document.lastName,
    middleName: document.middleName,
    phone: document.phone,
    status: document.status,
  };
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
