import mongoose from "mongoose";
import { CATALOG_KIND } from "./catalog.constants.js";

function assertKnownKind(kind) {
  if (!Object.values(CATALOG_KIND).includes(kind)) {
    throw new RangeError(`Невідомий catalog kind: ${String(kind)}`);
  }
}

function toCatalogEntry(document) {
  const entry = {
    id: document._id.toString(),
    kind: document.kind,
    code: document.code,
    name: document.name,
    active: document.active,
  };

  for (const field of ["age", "roomType", "capacity"]) {
    if (document[field] !== undefined) {
      entry[field] = document[field];
    }
  }

  return entry;
}

export class CatalogRepository {
  constructor({ catalogModel }) {
    this.catalogModel = catalogModel;
  }

  async insert(entry) {
    const document = await this.catalogModel.create(entry);
    return toCatalogEntry(document);
  }

  async findById(entryId) {
    if (!mongoose.isObjectIdOrHexString(entryId)) {
      return null;
    }

    const document = await this.catalogModel.findById(entryId).lean();
    return document ? toCatalogEntry(document) : null;
  }

  async findActiveByKind(kind) {
    assertKnownKind(kind);
    const documents = await this.catalogModel
      .find({ kind, active: true })
      .sort({ code: 1, _id: 1 })
      .lean();
    return documents.map(toCatalogEntry);
  }

  async findActiveByCode(kind, code) {
    assertKnownKind(kind);
    const document = await this.catalogModel
      .findOne({ kind, code, active: true })
      .lean();
    return document ? toCatalogEntry(document) : null;
  }

  async deactivateById(entryId) {
    if (!mongoose.isObjectIdOrHexString(entryId)) {
      return null;
    }

    const document = await this.catalogModel.findByIdAndUpdate(
      entryId,
      { $set: { active: false } },
      { returnDocument: "after", runValidators: true },
    );
    return document ? toCatalogEntry(document) : null;
  }
}
