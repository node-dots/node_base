export class AuditRepository {
  constructor({ auditModel }) {
    if (!auditModel) throw new TypeError("auditModel is required");
    this.auditModel = auditModel;
  }

  async insert(entry, { session } = {}) {
    if (!session) throw new TypeError("audit writes require a MongoDB session");

    const [document] = await this.auditModel.create([entry], { session });
    return {
      id: document._id.toString(),
      actorId: document.actorId,
      requestId: document.requestId,
      action: document.action,
      entityType: document.entityType,
      entityId: document.entityId,
      occurredAt: document.occurredAt,
      before: document.before,
      after: document.after,
    };
  }
}
