import mongoose from "mongoose";

const historySchema = new mongoose.Schema(
  {
    entityType: { type: String, required: true, maxlength: 64 },
    entityId: { type: String, required: true, maxlength: 128 },
    version: { type: Number, required: true, min: 1 },
    action: {
      type: String,
      required: true,
      enum: ["CREATE", "UPDATE", "DELETE"],
    },
    changedAt: { type: Date, required: true },
    actorId: { type: String, default: null, maxlength: 128 },
    requestId: { type: String, required: true, maxlength: 256 },
    correlationId: { type: String, default: null, maxlength: 256 },
    source: {
      type: String,
      required: true,
      enum: ["API", "SERVICE", "SEED", "MIGRATION", "OTHER"],
    },
    reason: { type: String, default: null, maxlength: 512 },
    before: { type: mongoose.Schema.Types.Mixed, default: null },
    after: { type: mongoose.Schema.Types.Mixed, default: null },
    changedFields: { type: [String], required: true },
  },
  {
    collection: "entity_versions",
    strict: "throw",
    timestamps: false,
    bufferCommands: false,
  },
);

historySchema.index(
  { entityType: 1, entityId: 1, version: 1 },
  { unique: true, name: "entity_version_unique" },
);
historySchema.index(
  { entityType: 1, changedAt: -1, _id: -1 },
  { name: "entity_history_search" },
);
historySchema.index({ requestId: 1 }, { name: "entity_history_request" });

function rejectHistoryMutation() {
  throw new Error("entity_versions is append-only");
}

historySchema.pre("save", function protectSavedVersion() {
  if (!this.isNew) rejectHistoryMutation();
});
for (const operation of [
  "updateOne",
  "updateMany",
  "findOneAndUpdate",
  "findOneAndReplace",
  "replaceOne",
  "deleteOne",
  "deleteMany",
  "findOneAndDelete",
  "bulkWrite",
]) {
  historySchema.pre(operation, rejectHistoryMutation);
}

const counterSchema = new mongoose.Schema(
  {
    entityType: { type: String, required: true, maxlength: 64 },
    entityId: { type: String, required: true, maxlength: 128 },
    sequence: { type: Number, required: true, min: 0 },
  },
  {
    collection: "entity_version_counters",
    strict: "throw",
    timestamps: false,
    bufferCommands: false,
  },
);
counterSchema.index(
  { entityType: 1, entityId: 1 },
  { unique: true, name: "entity_version_counter_unique" },
);

export const EntityVersionModel = mongoose.model(
  "EntityVersion",
  historySchema,
);
export const EntityVersionCounterModel = mongoose.model(
  "EntityVersionCounter",
  counterSchema,
);
