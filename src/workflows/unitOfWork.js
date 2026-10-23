export class UnitOfWork {
  constructor({ connection, auditWriter }) {
    if (!connection || typeof connection.startSession !== "function") {
      throw new TypeError("connection.startSession() is required");
    }
    if (!auditWriter || typeof auditWriter.record !== "function") {
      throw new TypeError("auditWriter.record() is required");
    }
    this.connection = connection;
    this.auditWriter = auditWriter;
  }

  async execute(operation) {
    if (typeof operation !== "function") {
      throw new TypeError("operation must be a function");
    }

    const session = await this.connection.startSession();
    let result;
    let committedCallbacks = [];

    try {
      await session.withTransaction(async () => {
        const attemptCallbacks = [];
        const attemptResult = await operation({
          session,
          recordAudit: (event) => this.auditWriter.record(event, { session }),
          afterCommit(callback) {
            if (typeof callback !== "function") {
              throw new TypeError("afterCommit requires a function");
            }
            attemptCallbacks.push(callback);
          },
        });

        result = attemptResult;
        committedCallbacks = attemptCallbacks;
        return attemptResult;
      });

      for (const callback of committedCallbacks) await callback();
      return result;
    } finally {
      await session.endSession();
    }
  }
}
