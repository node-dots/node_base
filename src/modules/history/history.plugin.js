import { appendEntityVersion } from "./history.writer.js";

function plain(document) {
  if (!document) return null;
  return typeof document.toObject === "function"
    ? document.toObject({
        depopulate: true,
        flattenMaps: true,
        virtuals: false,
      })
    : document;
}

async function findBefore(query, many = false) {
  const options = query.getOptions();
  let finder = many
    ? query.model.find(query.getFilter())
    : query.model.findOne(query.getFilter());
  if (options.session) finder = finder.session(options.session);
  return many ? finder.lean() : finder.lean();
}

function queryHistoryState(query) {
  query.$locals ??= {};
  return query.$locals;
}

export function entityHistoryPlugin(schema, { entityType }) {
  if (!entityType) throw new TypeError("history entityType is required");

  schema.pre("save", async function rememberBeforeSave() {
    this.$locals.historyWasNew = this.isNew;
    if (!this.isNew) {
      let query = this.constructor.findById(this._id);
      const session = this.$session();
      if (session) query = query.session(session);
      this.$locals.historyBefore = await query.lean();
    }
  });
  schema.post("save", async function recordSaved(document) {
    const before = this.$locals.historyBefore ?? null;
    await appendEntityVersion(
      {
        entityType,
        entityId: document._id,
        action: this.$locals.historyWasNew ? "CREATE" : "UPDATE",
        before,
        after: plain(document),
      },
      { session: document.$session(), connection: document.constructor.db },
    );
  });

  for (const operation of ["findOneAndUpdate", "findOneAndReplace"]) {
    schema.pre(operation, async function rememberBeforeQuery() {
      queryHistoryState(this).historyBefore = await findBefore(this);
    });
    schema.post(operation, async function recordQueryUpdate(document) {
      const before = queryHistoryState(this).historyBefore;
      const after = plain(document);
      if (!before && !after) return;
      await appendEntityVersion(
        {
          entityType,
          entityId: after?._id ?? before?._id,
          action: before ? "UPDATE" : "CREATE",
          before: before ?? null,
          after: after ?? null,
        },
        { session: this.getOptions().session, connection: this.model.db },
      );
    });
  }

  for (const operation of ["updateOne", "updateMany"]) {
    const many = operation === "updateMany";
    schema.pre(operation, async function rememberBeforeUpdate() {
      const found = await findBefore(this, many);
      queryHistoryState(this).historyBefore = many
        ? found
        : found
          ? [found]
          : [];
    });
    schema.post(operation, async function recordUpdated(result) {
      const beforeDocuments = queryHistoryState(this).historyBefore ?? [];
      const session = this.getOptions().session;
      if (beforeDocuments.length === 0 && result?.upsertedId) {
        let query = this.model.findById(result.upsertedId);
        if (session) query = query.session(session);
        const after = await query.lean();
        if (after)
          await appendEntityVersion(
            {
              entityType,
              entityId: after._id,
              action: "CREATE",
              before: null,
              after,
            },
            { session, connection: this.model.db },
          );
        return;
      }
      for (const before of beforeDocuments) {
        let query = this.model.findById(before._id);
        if (session) query = query.session(session);
        const after = await query.lean();
        if (!after || JSON.stringify(before) === JSON.stringify(after))
          continue;
        await appendEntityVersion(
          {
            entityType,
            entityId: before._id,
            action: "UPDATE",
            before,
            after,
          },
          { session, connection: this.model.db },
        );
      }
    });
  }

  for (const operation of ["findOneAndDelete", "deleteOne", "deleteMany"]) {
    const many = operation === "deleteMany";
    schema.pre(operation, async function rememberBeforeDelete() {
      const found = await findBefore(this, many);
      queryHistoryState(this).historyBefore = many
        ? found
        : found
          ? [found]
          : [];
    });
    schema.post(operation, async function recordDeleted() {
      for (const before of queryHistoryState(this).historyBefore ?? [])
        await appendEntityVersion(
          {
            entityType,
            entityId: before._id,
            action: "DELETE",
            before,
            after: null,
          },
          {
            session: this.getOptions().session,
            connection: this.model.db,
          },
        );
    });
  }

  schema.post("insertMany", async function recordInserted(documents) {
    const session = documents[0]?.$session?.() ?? null;
    for (const document of documents)
      await appendEntityVersion(
        {
          entityType,
          entityId: document._id,
          action: "CREATE",
          before: null,
          after: plain(document),
        },
        { session, connection: this.db },
      );
  });
}
