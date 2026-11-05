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
  if (document.revision !== undefined) entry.revision = document.revision;

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

  async ensureAdminGuard() {
    await this.catalogModel.init();
    try {
      await this.catalogModel.updateOne(
        { kind: CATALOG_KIND.SETTINGS, code: "ACCOUNT_ADMIN_GUARD" },
        {
          $setOnInsert: {
            kind: CATALOG_KIND.SETTINGS,
            code: "ACCOUNT_ADMIN_GUARD",
            name: "Account admin guard",
            active: true,
            revision: 0,
          },
        },
        { upsert: true },
      );
    } catch (error) {
      // Parallel first use may race on the unique kind/code index. The winner
      // creates the guard; a duplicate-key loser can safely use that record.
      if (error?.code !== 11000) throw error;
    }
  }

  async incrementAdminGuard({ session } = {}) {
    const document = await this.catalogModel
      .findOneAndUpdate(
        { kind: CATALOG_KIND.SETTINGS, code: "ACCOUNT_ADMIN_GUARD" },
        { $inc: { revision: 1 } },
        { new: true, runValidators: true, session },
      )
      .lean();
    if (!document) throw new Error("ACCOUNT_ADMIN_GUARD is not initialized");
    return toCatalogEntry(document);
  }
}
