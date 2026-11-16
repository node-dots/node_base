function toVersion(document) {
  if (!document) return null;
  return {
    id: document._id.toString(),
    entityType: document.entityType,
    entityId: document.entityId,
    version: document.version,
    action: document.action,
    changedAt: document.changedAt,
    actorId: document.actorId ?? null,
    requestId: document.requestId,
    correlationId: document.correlationId ?? null,
    source: document.source,
    reason: document.reason ?? null,
    before: document.before ?? null,
    after: document.after ?? null,
    changedFields: [...document.changedFields],
  };
}

export class HistoryRepository {
  constructor({ historyModel }) {
    if (!historyModel) throw new TypeError("historyModel is required");
    this.historyModel = historyModel;
  }

  async list({ entityType, entityId, version, from, to, page, pageSize }) {
    const filter = {};
    if (entityType) filter.entityType = entityType;
    if (entityId) filter.entityId = entityId;
    if (version) filter.version = version;
    if (from || to) {
      filter.changedAt = {};
      if (from) filter.changedAt.$gte = new Date(from);
      if (to) filter.changedAt.$lte = new Date(to);
    }
    const [documents, total] = await Promise.all([
      this.historyModel
        .find(filter)
        .sort({ changedAt: -1, _id: -1 })
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .lean(),
      this.historyModel.countDocuments(filter),
    ]);
    return { versions: documents.map(toVersion), total };
  }

  async findVersion(entityType, entityId, version) {
    return toVersion(
      await this.historyModel.findOne({ entityType, entityId, version }).lean(),
    );
  }
}
