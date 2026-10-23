const SENSITIVE_FIELD =
  /(password|credential|jwt|token|secret|authorization|cookie|email|phone|address|birth|medical|health|salary|comment|note)/i;
const FIELD_NAME = /^[a-z][a-zA-Z0-9]{0,63}$/;
const MAX_SNAPSHOT_FIELDS = 20;
const MAX_ARRAY_VALUES = 20;
const MAX_STRING_LENGTH = 256;

function sanitizeValue(value, field) {
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.length <= MAX_STRING_LENGTH)
    return value;

  if (
    Array.isArray(value) &&
    value.length <= MAX_ARRAY_VALUES &&
    value.every(
      (item) => typeof item === "string" && item.length <= MAX_STRING_LENGTH,
    )
  ) {
    return [...value];
  }

  throw new TypeError(`audit snapshot field '${field}' is not a safe scalar`);
}

export function sanitizeAuditSnapshot(snapshot, safeFields) {
  if (snapshot === undefined || snapshot === null) return null;
  if (
    typeof snapshot !== "object" ||
    Array.isArray(snapshot) ||
    !(safeFields instanceof Set) ||
    safeFields.size > MAX_SNAPSHOT_FIELDS
  ) {
    throw new TypeError("audit snapshots require a bounded safe-field set");
  }

  for (const field of safeFields) {
    if (typeof field !== "string" || !FIELD_NAME.test(field)) {
      throw new TypeError("audit snapshot field names are invalid");
    }
    if (SENSITIVE_FIELD.test(field)) {
      throw new TypeError(
        `sensitive audit snapshot field '${field}' is forbidden`,
      );
    }
  }

  const result = {};
  for (const field of safeFields) {
    if (Object.hasOwn(snapshot, field)) {
      result[field] = sanitizeValue(snapshot[field], field);
    }
  }

  return Object.keys(result).length > 0 ? result : null;
}

function validateIdentifier(value, name, maxLength) {
  if (
    typeof value !== "string" ||
    value.trim().length === 0 ||
    value.length > maxLength
  ) {
    throw new TypeError(`${name} must be a non-empty string`);
  }
  return value;
}

export class AuditWriter {
  constructor({ auditRepository, clock }) {
    if (!auditRepository || !clock || typeof clock.now !== "function") {
      throw new TypeError("auditRepository and clock are required");
    }
    this.auditRepository = auditRepository;
    this.clock = clock;
  }

  async record(event, { session } = {}) {
    if (!session) throw new TypeError("audit writes require a MongoDB session");
    if (!event || typeof event !== "object" || Array.isArray(event)) {
      throw new TypeError("audit event must be an object");
    }

    const safeFields = new Set(event.safeFields ?? []);
    const occurredAt = this.clock.now();
    if (!(occurredAt instanceof Date) || Number.isNaN(occurredAt.getTime())) {
      throw new TypeError("clock.now() must return a valid Date");
    }

    return this.auditRepository.insert(
      {
        actorId: validateIdentifier(event.actorId, "actorId", 128),
        requestId: validateIdentifier(event.requestId, "requestId", 128),
        action: validateIdentifier(event.action, "action", 64),
        entityType: validateIdentifier(event.entityType, "entityType", 64),
        entityId: validateIdentifier(event.entityId, "entityId", 128),
        occurredAt,
        before: sanitizeAuditSnapshot(event.before, safeFields),
        after: sanitizeAuditSnapshot(event.after, safeFields),
      },
      { session },
    );
  }
}
