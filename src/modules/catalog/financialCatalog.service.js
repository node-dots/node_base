import { AppError } from "../../utils/errors.js";
import { getCurrentCalendarDate, systemClock } from "../../utils/calendar.js";
import { CATALOG_KIND } from "./catalog.constants.js";
import { catalogEntrySchema } from "./catalog.schema.js";
import { PERMISSIONS } from "../../utils/access/permissions.js";
import {
  assertEffectiveDate,
  latestValidVersion,
  validateFinancialVersion,
} from "./financialRules.js";

const FINANCIAL_KINDS = new Set([
  CATALOG_KIND.TUITION_RATE,
  CATALOG_KIND.MEAL_RATE,
  CATALOG_KIND.BENEFIT,
]);
const VERSIONED_KINDS = new Set([...FINANCIAL_KINDS, CATALOG_KIND.PROGRAM]);

export class FinancialCatalogService {
  constructor({
    catalogRepository,
    authorizer,
    unitOfWork,
    clock = systemClock,
  }) {
    Object.assign(this, { catalogRepository, authorizer, unitOfWork, clock });
    authorizer.assertKnown(PERMISSIONS.CATALOG_CREATE);
    authorizer.assertKnown(PERMISSIONS.CATALOG_READ);
  }

  async createVersion(input, actor, requestId) {
    this.authorizer.assertPermission(actor, PERMISSIONS.CATALOG_CREATE);
    let entry;
    try {
      entry = catalogEntrySchema.parse(input);
    } catch (error) {
      throw new AppError(
        400,
        "INVALID_CATALOG_ENTRY",
        "Catalog entry is invalid",
        error.issues,
      );
    }
    if (!VERSIONED_KINDS.has(entry.kind)) {
      throw new AppError(
        400,
        "INVALID_VERSION_KIND",
        "Only financial and program rules are versioned here",
      );
    }
    const today = getCurrentCalendarDate(this.clock);
    assertEffectiveDate(entry.effectiveFrom);
    if (FINANCIAL_KINDS.has(entry.kind))
      validateFinancialVersion({ effectiveFrom: entry.effectiveFrom, today });
    if (entry.kind === CATALOG_KIND.PROGRAM) {
      const date = new Date(`${entry.effectiveFrom}T00:00:00.000Z`);
      if (
        date.toISOString().slice(0, 10) !== entry.effectiveFrom ||
        date.getUTCDay() !== 1 ||
        entry.effectiveFrom <= today
      )
        throw new AppError(
          400,
          "INVALID_PROGRAM_EFFECTIVE_DATE",
          "Program versions must start on a future Monday",
        );
    }
    return this.unitOfWork.execute(async ({ session, recordAudit }) => {
      try {
        const created = await this.catalogRepository.insertVersion(entry, {
          session,
        });
        await recordAudit({
          actorId: actor.id,
          requestId,
          action: "catalog.version.create",
          entityType: "CATALOG",
          entityId: created.id,
          after: {
            kind: created.kind,
            code: created.code,
            effectiveFrom: created.effectiveFrom,
          },
          safeFields: ["kind", "code", "effectiveFrom"],
        });
        return created;
      } catch (error) {
        if (error?.code === 11000)
          throw new AppError(
            409,
            "CATALOG_VERSION_EXISTS",
            "A version for this code and effective date already exists",
          );
        throw error;
      }
    });
  }

  async getForDate(kind, code, date, actor) {
    this.authorizer.assertPermission(actor, PERMISSIONS.CATALOG_READ);
    assertEffectiveDate(date);
    const entry = await this.catalogRepository.findLatestValid(
      kind,
      code,
      date,
    );
    if (!entry)
      throw new AppError(
        404,
        "FINANCIAL_VERSION_NOT_FOUND",
        "No catalog version exists for the requested date",
      );
    return latestValidVersion([entry], date, { kind, code });
  }
}
