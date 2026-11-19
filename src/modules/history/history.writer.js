import {
  EntityVersionCounterModel,
  EntityVersionModel,
} from "./history.model.js";
import { resolveHistoryContext } from "./history.context.js";
import {
  collectChangedFields,
  HISTORY_LIMITS,
  sanitizeHistorySnapshot,
} from "./history.snapshot.js";

function bounded(value, maxLength) {
  if (value === null || value === undefined) return null;
  const text = String(value);
  return text.length <= maxLength ? text : text.slice(0, maxLength);
}

export async function appendEntityVersion(
  { entityType, entityId, action, before, after },
  { session, connection } = {},
) {
  const historyModel =
    connection?.models?.EntityVersion ??
    connection?.model?.("EntityVersion", EntityVersionModel.schema) ??
    EntityVersionModel;
  const counterModel =
    connection?.models?.EntityVersionCounter ??
    connection?.model?.(
      "EntityVersionCounter",
      EntityVersionCounterModel.schema,
    ) ??
    EntityVersionCounterModel;
  const context = resolveHistoryContext();
  const id = String(entityId);
  const changedFields = collectChangedFields(before, after);
  const safeBefore = sanitizeHistorySnapshot(before);
  const safeAfter = sanitizeHistorySnapshot(after);
  const counter = await counterModel
    .findOneAndUpdate(
      { entityType, entityId: id },
      { $inc: { sequence: 1 }, $setOnInsert: { entityType, entityId: id } },
      { upsert: true, returnDocument: "after", session },
    )
    .lean();
  const [record] = await historyModel.create(
    [
      {
        entityType,
        entityId: id,
        version: counter.sequence,
        action,
        changedAt: new Date(),
        actorId: bounded(context.actorId, 128),
        requestId: bounded(context.requestId, 256),
        correlationId: bounded(context.correlationId, 256),
        source: context.source,
        reason: bounded(context.reason, HISTORY_LIMITS.MAX_REASON_LENGTH),
        before: safeBefore,
        after: safeAfter,
        changedFields,
      },
    ],
    { session },
  );
  return record.toObject();
}
