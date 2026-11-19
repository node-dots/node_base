import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";

const storage = new AsyncLocalStorage();

export function withHistoryContext(context, callback) {
  if (typeof callback !== "function")
    throw new TypeError("history context callback is required");
  return storage.run(
    {
      requestId: context?.requestId ?? `internal:${randomUUID()}`,
      correlationId: context?.correlationId ?? null,
      actorId: context?.actorId ?? null,
      source: context?.source ?? "OTHER",
      reason: context?.reason ?? null,
    },
    callback,
  );
}

export function getHistoryContext() {
  return storage.getStore() ?? null;
}

export function setHistoryActor(actorId) {
  const context = storage.getStore();
  if (context && actorId !== undefined && actorId !== null) {
    context.actorId = String(actorId);
  }
}

export function resolveHistoryContext() {
  return (
    getHistoryContext() ?? {
      requestId: `internal:${randomUUID()}`,
      correlationId: null,
      actorId: null,
      source: "OTHER",
      reason: null,
    }
  );
}
