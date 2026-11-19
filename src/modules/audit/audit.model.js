import mongoose from "mongoose";

const auditSchema = new mongoose.Schema(
  {
    actorId: { type: String, required: true, maxlength: 128 },
    requestId: { type: String, required: true, maxlength: 128 },
    action: { type: String, required: true, maxlength: 64 },
    entityType: { type: String, required: true, maxlength: 64 },
    entityId: { type: String, required: true, maxlength: 128 },
    occurredAt: { type: Date, required: true },
    before: { type: mongoose.Schema.Types.Mixed, default: null },
    after: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  {
    collection: "audit_logs",
    strict: "throw",
    timestamps: false,
    bufferCommands: false,
  },
);

auditSchema.index(
  { entityType: 1, entityId: 1, occurredAt: -1 },
  { name: "audit_entity_history" },
);

export const AuditModel = mongoose.model("AuditLog", auditSchema);
