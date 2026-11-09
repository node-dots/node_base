import { AppError, ResourceNotFoundError } from "../../utils/errors.js";
import { PERMISSIONS } from "../../utils/access/permissions.js";
import { systemClock } from "../../utils/calendar.js";
import {
  createExpenseSchema,
  correctionSchema,
  payExpenseSchema,
} from "./expense.schema.js";

export class ExpenseService {
  constructor({
    expenseRepository,
    authorizer,
    unitOfWork,
    clock = systemClock,
  }) {
    Object.assign(this, { expenseRepository, authorizer, unitOfWork, clock });
    for (const p of [
      PERMISSIONS.EXPENSES_READ,
      PERMISSIONS.EXPENSES_CREATE,
      PERMISSIONS.EXPENSES_APPROVE,
    ])
      authorizer.assertKnown(p);
  }
  async create(input, actor, requestId) {
    this.authorizer.assertPermission(actor, PERMISSIONS.EXPENSES_CREATE);
    try {
      input = createExpenseSchema.parse(input);
    } catch (e) {
      throw new AppError(
        400,
        "INVALID_EXPENSE",
        "Expense is invalid",
        e.issues,
      );
    }
    return this.unitOfWork.execute(async ({ session, recordAudit }) => {
      const expense = await this.expenseRepository.insert(input, { session });
      await recordAudit({
        actorId: actor.id,
        requestId,
        action: "expense.create",
        entityType: "EXPENSE",
        entityId: expense.id,
        after: {
          category: expense.category,
          amountCents: expense.amountCents,
          serviceMonth: expense.serviceMonth,
        },
        safeFields: ["category", "amountCents", "serviceMonth"],
      });
      return expense;
    });
  }
  async approve(id, actor, requestId) {
    this.authorizer.assertPermission(actor, PERMISSIONS.EXPENSES_APPROVE);
    return this.unitOfWork.execute(async ({ session, recordAudit }) => {
      const expense = await this.expenseRepository.approve(id, { session });
      if (!expense)
        throw new AppError(
          409,
          "EXPENSE_NOT_DRAFT",
          "Only a draft expense can be approved",
        );
      await recordAudit({
        actorId: actor.id,
        requestId,
        action: "expense.approve",
        entityType: "EXPENSE",
        entityId: id,
        after: { status: expense.status },
        safeFields: ["status"],
      });
      return expense;
    });
  }
  async pay(id, input, actor, requestId) {
    this.authorizer.assertPermission(actor, PERMISSIONS.EXPENSES_APPROVE);
    try {
      input = payExpenseSchema.parse(input);
    } catch (e) {
      throw new AppError(
        400,
        "INVALID_EXPENSE_PAYMENT",
        "Expense payment is invalid",
        e.issues,
      );
    }
    const date = new Date(`${input.paymentDate}T00:00:00.000Z`);
    if (
      !Number.isFinite(date.getTime()) ||
      date.toISOString().slice(0, 10) !== input.paymentDate
    )
      throw new AppError(
        400,
        "INVALID_PAYMENT_DATE",
        "Payment date must be a real calendar date",
      );
    return this.unitOfWork.execute(async ({ session, recordAudit }) => {
      const expense = await this.expenseRepository.pay(
        id,
        input.paymentDate,
        this.clock.now(),
        { session },
      );
      if (!expense)
        throw new AppError(
          409,
          "EXPENSE_NOT_PAYABLE",
          "Expense must be approved and unpaid",
        );
      await recordAudit({
        actorId: actor.id,
        requestId,
        action: "expense.pay",
        entityType: "EXPENSE",
        entityId: id,
        after: {
          paymentDate: expense.paymentDate,
          amountCents: expense.amountCents,
        },
        safeFields: ["paymentDate", "amountCents"],
      });
      return expense;
    });
  }
  async cancel(id, actor, requestId) {
    this.authorizer.assertPermission(actor, PERMISSIONS.EXPENSES_APPROVE);
    return this.unitOfWork.execute(async ({ session, recordAudit }) => {
      const expense = await this.expenseRepository.cancel(id, { session });
      if (!expense)
        throw new AppError(
          409,
          "EXPENSE_NOT_CANCELLABLE",
          "Only a draft expense can be cancelled",
        );
      await recordAudit({
        actorId: actor.id,
        requestId,
        action: "expense.cancel",
        entityType: "EXPENSE",
        entityId: id,
        after: { status: expense.status },
        safeFields: ["status"],
      });
      return expense;
    });
  }
  async correct(id, input, actor, requestId) {
    this.authorizer.assertPermission(actor, PERMISSIONS.EXPENSES_APPROVE);
    try {
      input = correctionSchema.parse(input);
    } catch (e) {
      throw new AppError(
        400,
        "INVALID_EXPENSE_CORRECTION",
        "Expense correction is invalid",
        e.issues,
      );
    }
    return this.unitOfWork.execute(async ({ session, recordAudit }) => {
      const original = await this.expenseRepository.findById(id, { session });
      if (!original || original.status !== "APPROVED")
        throw new ResourceNotFoundError(
          "EXPENSE_NOT_FOUND",
          "Approved expense not found",
        );
      const direction = input.amountCents > 0 ? "INCREASE" : "DECREASE";
      const amountCents = Math.abs(input.amountCents);
      const netAmount = await this.expenseRepository.netApproved(id, {
        session,
      });
      if (
        direction === "DECREASE" &&
        (original.paidAt || netAmount < amountCents)
      )
        throw new AppError(
          409,
          "EXPENSE_CORRECTION_FORBIDDEN",
          "Paid expenses may only be increased and net expense cannot be negative",
        );
      const correction = await this.expenseRepository.insert(
        {
          category: original.category,
          amountCents,
          serviceMonth: original.serviceMonth,
          reason: input.reason,
          status: "APPROVED",
          correctionOf: id,
          correctionDirection: direction,
        },
        { session },
      );
      await recordAudit({
        actorId: actor.id,
        requestId,
        action: "expense.correct",
        entityType: "EXPENSE",
        entityId: correction.id,
        after: {
          correctionOf: id,
          correctionDirection: direction,
          amountCents,
        },
        safeFields: ["correctionOf", "correctionDirection", "amountCents"],
      });
      return correction;
    });
  }
  async readTotals(month, actor) {
    this.authorizer.assertPermission(actor, PERMISSIONS.EXPENSES_READ);
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))
      throw new AppError(400, "INVALID_EXPENSE_MONTH", "Month must be YYYY-MM");
    return {
      serviceMonth: month,
      approvedAmountCents: await this.expenseRepository.sumApproved(month),
      cashOutflowCents: await this.expenseRepository.sumCashFlow(month),
    };
  }
  async listForMonth({ month, page, pageSize }, actor) {
    this.authorizer.assertPermission(actor, PERMISSIONS.EXPENSES_READ);
    const { expenses, total } =
      await this.expenseRepository.findPageByServiceMonth({
        month,
        page,
        pageSize,
      });
    return {
      expenses,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }
}
