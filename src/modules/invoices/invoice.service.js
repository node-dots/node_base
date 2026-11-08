import { AppError, ResourceNotFoundError } from "../../utils/errors.js";
import { getCurrentCalendarDate, systemClock } from "../../utils/calendar.js";
import { PERMISSIONS } from "../../utils/access/permissions.js";
import { CHILD_STATUS } from "../children/child.constants.js";
import {
  calculateMealCents,
  calculateAnnualTuitionParts,
  calculateTuitionCents,
  countWeekdaysInServiceMonth,
  addServiceMonths,
  annualPaymentDeadline,
  invoiceDueAt,
} from "./invoice.calculations.js";

function benefitForMonth(assignments, month) {
  return assignments.find(
    (item) =>
      item.startMonth <= month && (!item.endMonth || item.endMonth >= month),
  );
}

export class InvoiceService {
  constructor({
    invoiceRepository,
    childRepository,
    catalogRepository,
    authorizer,
    unitOfWork,
    clock = systemClock,
  }) {
    Object.assign(this, {
      invoiceRepository,
      childRepository,
      catalogRepository,
      authorizer,
      unitOfWork,
      clock,
    });
    authorizer.assertKnown(PERMISSIONS.INVOICES_CREATE);
    authorizer.assertKnown(PERMISSIONS.INVOICES_READ);
  }

  async generateForCurrentMonth(childId, actor, requestId) {
    this.authorizer.assertPermission(actor, PERMISSIONS.INVOICES_CREATE);
    const child = await this.childRepository.findById(childId);
    if (!child)
      throw new ResourceNotFoundError("CHILD_NOT_FOUND", "Child not found");
    if (![CHILD_STATUS.ACTIVE, CHILD_STATUS.SUSPENDED].includes(child.status)) {
      return { invoices: [], skipped: "CHILD_NOT_BILLABLE" };
    }
    const currentDate = getCurrentCalendarDate(this.clock);
    const month = currentDate.slice(0, 7);
    if (!child.billingStartMonth || child.billingStartMonth > month)
      return { invoices: [], skipped: "BILLING_NOT_STARTED" };

    const keys = ["TUITION", "MEAL"].map((service) => ({
      childId: child.id,
      service,
      serviceMonth: month,
    }));
    const existing = await Promise.all(
      keys.map((key) =>
        key.service === "TUITION" &&
        this.invoiceRepository.findTuitionCoveringMonth
          ? this.invoiceRepository.findTuitionCoveringMonth(
              key.childId,
              key.serviceMonth,
            )
          : this.invoiceRepository.findByUnique(key),
      ),
    );
    if (existing.every(Boolean)) {
      return {
        invoices: existing,
        skipped: null,
        historyGap: await this.hasPreviousMonthGap(child, month),
      };
    }
    const drafts = [];
    if (!existing[0]) drafts.push(await this.buildTuitionInvoice(child, month));
    if (!existing[1]) drafts.push(await this.buildMealInvoice(child, month));
    try {
      return await this.unitOfWork.execute(async ({ session, recordAudit }) => {
        const invoices = [...existing.filter(Boolean)];
        for (const draft of drafts) {
          const existing =
            draft.service === "TUITION" &&
            this.invoiceRepository.findTuitionCoveringMonth
              ? await this.invoiceRepository.findTuitionCoveringMonth(
                  draft.childId,
                  draft.serviceMonth,
                  { session },
                )
              : await this.invoiceRepository.findByUnique(draft, { session });
          if (existing) {
            invoices.push(existing);
            continue;
          }
          const created = await this.invoiceRepository.insert(draft, {
            session,
          });
          invoices.push(created);
          await recordAudit({
            actorId: actor.id,
            requestId,
            action: "invoice.generate",
            entityType: "INVOICE",
            entityId: created.id,
            after: {
              childId,
              service: created.service,
              serviceMonth: month,
              origAmountCents: created.origAmountCents,
            },
            safeFields: [
              "childId",
              "service",
              "serviceMonth",
              "origAmountCents",
            ],
          });
        }
        return {
          invoices,
          skipped: null,
          historyGap: await this.hasPreviousMonthGap(child, month, session),
        };
      });
    } catch (error) {
      if (error?.code !== 11000) throw error;
      return {
        invoices: await Promise.all(
          keys.map((key) =>
            key.service === "TUITION" &&
            this.invoiceRepository.findTuitionCoveringMonth
              ? this.invoiceRepository.findTuitionCoveringMonth(
                  key.childId,
                  key.serviceMonth,
                )
              : this.invoiceRepository.findByUnique(key),
          ),
        ),
        skipped: null,
        historyGap: await this.hasPreviousMonthGap(child, month),
      };
    }
  }

  async buildTuitionInvoice(child, month) {
    const tariff = await this.catalogRepository.findLatestValid(
      "TUITION_RATE",
      "TUITION_MONTHLY",
      `${month}-01`,
    );
    if (!tariff)
      throw new AppError(
        404,
        "TUITION_RATE_NOT_FOUND",
        `No tuition rate is valid for ${month}`,
      );
    const benefit = benefitForMonth(child.benefitAssignments ?? [], month);
    const basisPoints = benefit?.basisPoints ?? 0;
    const amountCents = calculateTuitionCents(tariff.amountCents, basisPoints);
    const dueAt = invoiceDueAt(month);
    return {
      childId: child.id,
      service: "TUITION",
      billingType: "MONTHLY",
      serviceMonth: month,
      status: "OPEN",
      origAmountCents: amountCents,
      remainingAmountCents: amountCents,
      tariffSnapshot: {
        code: tariff.code,
        effectiveFrom: tariff.effectiveFrom,
        amountCents: tariff.amountCents,
      },
      ...(benefit
        ? { benefitSnapshot: { code: benefit.benefitCode, basisPoints } }
        : {}),
      formula: benefit
        ? `roundHalfUp(${tariff.amountCents} * (10000 - ${basisPoints}) / 10000)`
        : `${tariff.amountCents}`,
      dueAt,
      parts: [{ month, amountCents, remainingCents: amountCents }],
    };
  }

  async buildMealInvoice(child, month) {
    if (!child.ageCategoryId)
      throw new AppError(
        409,
        "AGE_CATEGORY_REQUIRED",
        "Child has no age category for meal billing",
      );
    const category = await this.catalogRepository.findById(child.ageCategoryId);
    if (!category || category.kind !== "AGE_CATEGORY" || !category.active)
      throw new AppError(
        409,
        "AGE_CATEGORY_UNAVAILABLE",
        "Child meal age category is unavailable",
      );
    const tariffCode = `MEAL_AGE_${category.age}`;
    const tariff = await this.catalogRepository.findLatestValid(
      "MEAL_RATE",
      tariffCode,
      `${month}-01`,
    );
    if (!tariff)
      throw new AppError(
        404,
        "MEAL_RATE_NOT_FOUND",
        `No meal rate for age ${category.age} is valid for ${month}`,
      );
    const weekdays = countWeekdaysInServiceMonth(month);
    const amountCents = calculateMealCents(tariff.amountCents, month);
    const dueAt = invoiceDueAt(month);
    return {
      childId: child.id,
      service: "MEAL",
      billingType: "MONTHLY",
      serviceMonth: month,
      status: "OPEN",
      origAmountCents: amountCents,
      remainingAmountCents: amountCents,
      tariffSnapshot: {
        code: tariff.code,
        effectiveFrom: tariff.effectiveFrom,
        amountCents: tariff.amountCents,
      },
      formula: `${tariff.amountCents} * ${weekdays} weekdays`,
      dueAt,
      parts: [{ month, amountCents, remainingCents: amountCents }],
    };
  }

  async hasPreviousMonthGap(child, currentMonth, session) {
    const [year, month] = currentMonth.split("-").map(Number);
    const previousMonth = new Date(Date.UTC(year, month - 2, 1))
      .toISOString()
      .slice(0, 7);
    if (
      !child.billingStartMonth ||
      child.billingStartMonth >= currentMonth ||
      child.billingStartMonth > previousMonth
    )
      return false;
    const [tuition, meal] = await Promise.all(
      ["TUITION", "MEAL"].map((service) =>
        service === "TUITION" && this.invoiceRepository.findTuitionCoveringMonth
          ? this.invoiceRepository.findTuitionCoveringMonth(
              child.id,
              previousMonth,
              { session },
            )
          : this.invoiceRepository.findByUnique(
              { childId: child.id, service, serviceMonth: previousMonth },
              { session },
            ),
      ),
    );
    return !tuition || !meal;
  }

  async createAnnualTuition(childId, firstMonth, actor, requestId) {
    this.authorizer.assertPermission(actor, PERMISSIONS.INVOICES_CREATE);
    let months;
    try {
      months = Array.from({ length: 12 }, (_, index) =>
        addServiceMonths(firstMonth, index),
      );
    } catch {
      throw new AppError(400, "INVALID_ANNUAL_MONTH", "First month is invalid");
    }
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(firstMonth))
      throw new AppError(400, "INVALID_ANNUAL_MONTH", "First month is invalid");
    const child = await this.childRepository.findById(childId);
    if (!child)
      throw new ResourceNotFoundError("CHILD_NOT_FOUND", "Child not found");
    if (![CHILD_STATUS.ACTIVE, CHILD_STATUS.SUSPENDED].includes(child.status))
      throw new AppError(409, "CHILD_NOT_BILLABLE", "Child is not billable");
    if (!child.billingStartMonth || firstMonth < child.billingStartMonth)
      throw new AppError(
        409,
        "ANNUAL_BEFORE_BILLING_START",
        "Annual tuition requires a billing start no later than its first month",
      );
    const now = this.clock.now();
    const deadline = annualPaymentDeadline(firstMonth);
    if (now > deadline)
      throw new AppError(
        409,
        "ANNUAL_PAYMENT_WINDOW_CLOSED",
        "Annual tuition must be created and confirmed before its first month",
      );
    const tariff = await this.catalogRepository.findLatestValid(
      "TUITION_RATE",
      "TUITION_MONTHLY",
      `${firstMonth}-01`,
    );
    if (!tariff)
      throw new AppError(
        404,
        "TUITION_RATE_NOT_FOUND",
        `No tuition rate is valid for ${firstMonth}`,
      );
    const benefit = benefitForMonth(child.benefitAssignments ?? [], firstMonth);
    const basisPoints = benefit?.basisPoints ?? 0;
    const parts = calculateAnnualTuitionParts(
      tariff.amountCents,
      basisPoints,
    ).map(({ amountCents }, index) => ({
      month: months[index],
      amountCents,
      remainingCents: amountCents,
    }));
    const origAmountCents = parts.reduce(
      (sum, part) => sum + part.amountCents,
      0,
    );
    const draft = {
      childId,
      service: "TUITION",
      billingType: "ANNUAL",
      serviceMonth: firstMonth,
      status: "OPEN",
      origAmountCents,
      remainingAmountCents: origAmountCents,
      tariffSnapshot: {
        code: tariff.code,
        effectiveFrom: tariff.effectiveFrom,
        amountCents: tariff.amountCents,
      },
      ...(benefit
        ? { benefitSnapshot: { code: benefit.benefitCode, basisPoints } }
        : {}),
      formula: `12 * roundHalfUp(roundHalfUp(${tariff.amountCents} * (10000 - ${basisPoints}) / 10000) * 8800 / 10000)`,
      dueAt: deadline,
      parts,
    };
    try {
      return await this.unitOfWork.execute(async ({ session, recordAudit }) => {
        for (const month of months) {
          const reserved = this.invoiceRepository.findTuitionCoveringMonth
            ? await this.invoiceRepository.findTuitionCoveringMonth(
                childId,
                month,
                { session },
              )
            : await this.invoiceRepository.findByUnique(
                { childId, service: "TUITION", serviceMonth: month },
                { session },
              );
          if (reserved)
            throw new AppError(
              409,
              "TUITION_MONTH_ALREADY_RESERVED",
              `Tuition for ${month} is already reserved`,
            );
        }
        const invoice = await this.invoiceRepository.insert(draft, { session });
        await recordAudit({
          actorId: actor.id,
          requestId,
          action: "invoice.generate.annual",
          entityType: "INVOICE",
          entityId: invoice.id,
          after: {
            childId,
            firstMonth,
            months: months.length,
            origAmountCents,
          },
          safeFields: ["childId", "firstMonth", "months", "origAmountCents"],
        });
        return invoice;
      });
    } catch (error) {
      if (error?.code === 11000)
        throw new AppError(
          409,
          "TUITION_MONTH_ALREADY_RESERVED",
          "A monthly or annual tuition invoice already reserves one of these months",
        );
      throw error;
    }
  }

  async fallbackExpiredAnnual(childId, actor, requestId) {
    this.authorizer.assertPermission(actor, PERMISSIONS.INVOICES_CREATE);
    const child = await this.childRepository.findById(childId);
    if (!child)
      throw new ResourceNotFoundError("CHILD_NOT_FOUND", "Child not found");
    const currentMonth = getCurrentCalendarDate(this.clock).slice(0, 7);
    if (![CHILD_STATUS.ACTIVE, CHILD_STATUS.SUSPENDED].includes(child.status))
      throw new AppError(
        409,
        "CHILD_NOT_BILLABLE",
        "Child is not billable for a new monthly invoice",
      );
    if (!child.billingStartMonth || child.billingStartMonth > currentMonth)
      throw new AppError(
        409,
        "BILLING_NOT_STARTED",
        "Child billing has not started for the current month",
      );
    return this.unitOfWork.execute(async ({ session, recordAudit }) => {
      const monthly = await this.invoiceRepository.findByUnique(
        { childId, service: "TUITION", serviceMonth: currentMonth },
        { session },
      );
      if (monthly)
        return { annual: null, monthly, skipped: "ALREADY_FALLBACK" };
      const annual = await this.invoiceRepository.cancelExpiredAnnual(
        childId,
        currentMonth,
        { session },
      );
      if (!annual)
        throw new AppError(
          409,
          "NO_EXPIRED_UNPAID_ANNUAL",
          "No expired unpaid annual tuition invoice can be replaced",
        );
      const draft = await this.buildTuitionInvoice(child, currentMonth);
      const created = await this.invoiceRepository.insert(draft, { session });
      await recordAudit({
        actorId: actor.id,
        requestId,
        action: "invoice.annual.fallback",
        entityType: "INVOICE",
        entityId: annual.id,
        after: {
          annualInvoiceId: annual.id,
          monthlyInvoiceId: created.id,
          serviceMonth: currentMonth,
        },
        safeFields: ["annualInvoiceId", "monthlyInvoiceId", "serviceMonth"],
      });
      return { annual, monthly: created, skipped: null };
    });
  }

  async listForChild(childId, actor) {
    this.authorizer.assertPermission(actor, PERMISSIONS.INVOICES_READ);
    const child = await this.childRepository.findById(childId);
    if (!child)
      throw new ResourceNotFoundError("CHILD_NOT_FOUND", "Child not found");
    if (
      actor.roles.includes("PARENT") &&
      !actor.roles.some((role) => ["ADMIN", "MANAGER"].includes(role)) &&
      !child.guardians.some(({ personId }) => personId === actor.id)
    )
      throw new ResourceNotFoundError("CHILD_NOT_FOUND", "Child not found");
    return this.invoiceRepository.listByChild(childId);
  }
}
