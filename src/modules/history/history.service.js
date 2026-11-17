import { AppError } from "../../utils/errors.js";
import { PERMISSIONS } from "../../utils/access/permissions.js";
import { collectChangedFields } from "./history.snapshot.js";

function stateAt(version) {
  return version.after;
}

export class HistoryService {
  constructor({ historyRepository, authorizer }) {
    this.historyRepository = historyRepository;
    this.authorizer = authorizer;
    authorizer.assertKnown(PERMISSIONS.HISTORY_READ);
  }

  async list(query, actor) {
    this.authorizer.assertPermission(actor, PERMISSIONS.HISTORY_READ);
    if (query.from && query.to && new Date(query.from) > new Date(query.to))
      throw new AppError(
        400,
        "INVALID_HISTORY_PERIOD",
        "from must not exceed to",
      );
    const { versions, total } = await this.historyRepository.list(query);
    return {
      versions,
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.ceil(total / query.pageSize),
      },
    };
  }

  async getVersion({ entityType, entityId, version }, actor) {
    this.authorizer.assertPermission(actor, PERMISSIONS.HISTORY_READ);
    const result = await this.historyRepository.findVersion(
      entityType,
      entityId,
      version,
    );
    if (!result)
      throw new AppError(404, "HISTORY_VERSION_NOT_FOUND", "Version not found");
    return result;
  }

  async compare({ entityType, entityId, fromVersion, toVersion }, actor) {
    this.authorizer.assertPermission(actor, PERMISSIONS.HISTORY_READ);
    const [from, to] = await Promise.all([
      this.historyRepository.findVersion(entityType, entityId, fromVersion),
      this.historyRepository.findVersion(entityType, entityId, toVersion),
    ]);
    if (!from || !to)
      throw new AppError(404, "HISTORY_VERSION_NOT_FOUND", "Version not found");
    const fromState = stateAt(from);
    const toState = stateAt(to);
    return {
      entityType,
      entityId,
      fromVersion,
      toVersion,
      fromState,
      toState,
      changedFields: collectChangedFields(fromState, toState),
    };
  }
}
