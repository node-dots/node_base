import mongoose from "mongoose";

export const HISTORY_LIMITS = Object.freeze({
  MAX_SNAPSHOT_BYTES: 2 * 1024 * 1024,
  MAX_CHANGED_FIELDS: 4096,
  MAX_REASON_LENGTH: 512,
});

const SENSITIVE_KEY =
  /(password|passphrase|credential|authorization|cookie|jwt|secret|api[_-]?key|private[_-]?key|card(number)?|cvv|cvc)/i;
const TOKEN_KEY =
  /(^|[_-])token($|[_-])|(?:access|refresh|id|auth|csrf|session)token/i;
export const REDACTED_VALUE = "[REDACTED]";

function normalizeValue(value, key, seen) {
  if (SENSITIVE_KEY.test(key) || TOKEN_KEY.test(key)) return REDACTED_VALUE;
  if (value === undefined) return undefined;
  if (value === null || typeof value === "string" || typeof value === "boolean")
    return value;
  if (typeof value === "number")
    return Number.isFinite(value) ? value : String(value);
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (value instanceof mongoose.Types.ObjectId) return value.toString();
  if (Buffer.isBuffer(value)) return "[BINARY_REDACTED]";
  if (Array.isArray(value))
    return value.map((item) => normalizeValue(item, key, seen));
  if (typeof value !== "object") return String(value);
  if (seen.has(value))
    throw new TypeError("history snapshots cannot contain cycles");
  seen.add(value);
  const plain =
    typeof value.toObject === "function"
      ? value.toObject({ depopulate: true, flattenMaps: true, virtuals: false })
      : value;
  const result = {};
  for (const [childKey, childValue] of Object.entries(plain)) {
    if (childKey === "__v") continue;
    const normalized = normalizeValue(childValue, childKey, seen);
    if (normalized !== undefined) result[childKey] = normalized;
  }
  seen.delete(value);
  return result;
}

export function sanitizeHistorySnapshot(snapshot) {
  if (snapshot === undefined || snapshot === null) return null;
  const normalized = normalizeValue(snapshot, "root", new WeakSet());
  const bytes = Buffer.byteLength(JSON.stringify(normalized), "utf8");
  if (bytes > HISTORY_LIMITS.MAX_SNAPSHOT_BYTES) {
    throw new RangeError(
      `history snapshot exceeds ${HISTORY_LIMITS.MAX_SNAPSHOT_BYTES} bytes`,
    );
  }
  return normalized;
}

function comparable(value) {
  if (value instanceof Date) return value.toISOString();
  if (value instanceof mongoose.Types.ObjectId) return value.toString();
  if (typeof value === "bigint") return value.toString();
  return value;
}

function collect(before, after, path, result) {
  before = comparable(before);
  after = comparable(after);
  if (Object.is(before, after)) return;
  if (Array.isArray(before) || Array.isArray(after)) {
    if (JSON.stringify(before) !== JSON.stringify(after)) result.add(path);
    return;
  }
  const beforeObject = before && typeof before === "object";
  const afterObject = after && typeof after === "object";
  if (beforeObject && afterObject) {
    const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
    for (const key of [...keys].sort())
      collect(before[key], after[key], path ? `${path}.${key}` : key, result);
    return;
  }
  result.add(path || "$document");
}

export function collectChangedFields(before, after) {
  const result = new Set();
  collect(before, after, "", result);
  const fields = [...result];
  if (fields.length > HISTORY_LIMITS.MAX_CHANGED_FIELDS) return ["$document"];
  return fields;
}
