import { AppError } from "../../utils/errors.js";
import { PERMISSIONS } from "../../utils/access/permissions.js";
import { ROLES } from "../../utils/access/roles.js";
import { systemClock } from "../../utils/calendar.js";
import { validateSchedule } from "./schedule.validator.js";
import { generateScheduleDraft } from "./schedule.generator.js";
import { publishScheduleSchema } from "./schedule.schema.js";
import {
  scheduleWeekSchema,
  updateScheduleDraftSchema,
} from "./schedule.schema.js";

const TEACHER_ROLES = [ROLES.TEACHER, ROLES.EDUCATOR, ROLES.ASSISTANT];

function sameAssignment(left, right) {
  return (
    left.id === right.id &&
    left.groupId === right.groupId &&
    left.roomId === right.roomId &&
    left.teacherId === right.teacherId &&
    left.subjectCode === right.subjectCode &&
    left.weekday === right.weekday
  );
}

export class ScheduleService {
  constructor({
    scheduleRepository,
    authorizer,
    clock = systemClock,
    unitOfWork,
    catalogRepository,
    snapshotProvider,
    guardianGroupsReader,
    groupRepository,
  }) {
    this.scheduleRepository = scheduleRepository;
    this.authorizer = authorizer;
    this.clock = clock;
    Object.assign(this, {
      unitOfWork,
      catalogRepository,
      snapshotProvider,
      guardianGroupsReader,
      groupRepository,
    });
    authorizer.assertKnown(PERMISSIONS.SCHEDULES_READ);
    authorizer.assertKnown(PERMISSIONS.SCHEDULES_UPDATE);
  }

  async getDraft(weekStart, actor) {
    this.authorizer.assertPermission(actor, PERMISSIONS.SCHEDULES_UPDATE);
    const parsedWeek = scheduleWeekSchema.safeParse(weekStart);
    if (!parsedWeek.success)
      throw new AppError(
        400,
        "INVALID_SCHEDULE_WEEK",
        "Schedule week is invalid",
      );
    return (
      (await this.scheduleRepository.findDraft(parsedWeek.data)) ?? {
        weekStart: parsedWeek.data,
        revision: 0,
        slots: [],
        updatedAt: null,
      }
    );
  }

  async updateDraft(weekStart, input, actor) {
    this.authorizer.assertPermission(actor, PERMISSIONS.SCHEDULES_UPDATE);
    const week = scheduleWeekSchema.safeParse(weekStart);
    const parsed = updateScheduleDraftSchema.safeParse(input);
    if (!week.success || !parsed.success)
      throw new AppError(
        400,
        "INVALID_SCHEDULE_DRAFT",
        "Schedule draft is invalid",
        [
          ...(week.success ? [] : week.error.issues),
          ...(parsed.success ? [] : parsed.error.issues),
        ],
      );

    const current = await this.scheduleRepository.findDraft(week.data);
    if ((current?.revision ?? 0) !== parsed.data.expectedRevision)
      throw new AppError(
        409,
        "SCHEDULE_REVISION_CONFLICT",
        "Schedule draft has changed; reload it before editing",
        { currentRevision: current?.revision ?? 0 },
      );

    let slots = parsed.data.slots;
    const mayEditAll = actor.roles.some((role) =>
      [ROLES.ADMIN, ROLES.MANAGER].includes(role),
    );
    if (!mayEditAll) {
      if (!actor.roles.some((role) => TEACHER_ROLES.includes(role)))
        this.authorizer.assertPermission(actor, PERMISSIONS.SCHEDULES_UPDATE);
      if (!current)
        throw new AppError(
          409,
          "TEACHER_DRAFT_EDIT_REQUIRES_EXISTING_SLOTS",
          "Teachers can only change times on existing assigned slots",
        );
      if (slots.length !== current.slots.length)
        throw new AppError(
          403,
          "SCHEDULE_SLOT_SCOPE_FORBIDDEN",
          "Teachers cannot add or remove schedule slots",
        );
      const oldSlots = new Map(current.slots.map((slot) => [slot.id, slot]));
      for (const slot of slots) {
        const prior = oldSlots.get(slot.id);
        if (
          !prior ||
          prior.teacherId !== actor.id ||
          !sameAssignment(prior, slot)
        )
          throw new AppError(
            403,
            "SCHEDULE_SLOT_SCOPE_FORBIDDEN",
            "Teachers may only change times on their own assigned slots",
          );
      }
    }

    try {
      const saved = await this.scheduleRepository.updateDraft({
        weekStart: week.data,
        expectedRevision: parsed.data.expectedRevision,
        slots,
        updatedById: actor.id,
      });
      if (!saved)
        throw new AppError(
          409,
          "SCHEDULE_REVISION_CONFLICT",
          "Schedule draft has changed; reload it before editing",
        );
      return saved;
    } catch (error) {
      if (error?.code === 11000)
        throw new AppError(
          409,
          "SCHEDULE_REVISION_CONFLICT",
          "Schedule draft has changed; reload it before editing",
        );
      throw error;
    }
  }

  async generateDraft(weekStart, input, actor) {
    this.authorizer.assertPermission(actor, PERMISSIONS.SCHEDULES_UPDATE);
    const week = scheduleWeekSchema.safeParse(weekStart);
    if (!week.success)
      throw new AppError(
        400,
        "INVALID_SCHEDULE_WEEK",
        "Schedule week is invalid",
      );
    const current = await this.scheduleRepository.findDraft(week.data);
    if ((current?.revision ?? 0) !== input.expectedRevision)
      throw new AppError(
        409,
        "SCHEDULE_REVISION_CONFLICT",
        "Schedule draft has changed; reload it before generating",
      );
    const snapshot = await this.snapshotProvider.read(week.data);
    const generated = await generateScheduleDraft({
      weekStart: week.data,
      snapshot,
      fixedSlots: input.fixedSlots,
    });
    const saved = await this.scheduleRepository.updateDraft({
      weekStart: week.data,
      expectedRevision: input.expectedRevision,
      slots: generated.slots,
      updatedById: actor.id,
    });
    if (!saved)
      throw new AppError(
        409,
        "SCHEDULE_REVISION_CONFLICT",
        "Schedule draft changed while generating",
      );
    return { ...generated, draft: saved };
  }

  async publish(weekStart, input, actor, requestId) {
    this.authorizer.assertPermission(actor, PERMISSIONS.SCHEDULES_PUBLISH);
    const week = scheduleWeekSchema.safeParse(weekStart);
    const parsed = publishScheduleSchema.safeParse(input);
    if (!week.success || !parsed.success)
      throw new AppError(
        400,
        "INVALID_SCHEDULE_PUBLICATION",
        "Schedule publication is invalid",
      );
    const startDate = new Date(`${week.data}T00:00:00.000Z`);
    if (
      Number.isNaN(startDate.getTime()) ||
      startDate.toISOString().slice(0, 10) !== week.data ||
      startDate.getUTCDay() !== 1
    )
      throw new AppError(
        400,
        "INVALID_SCHEDULE_WEEK",
        "Schedule week is invalid",
      );
    const today = this.clock.now();
    const currentMonday = new Date(today);
    currentMonday.setUTCHours(0, 0, 0, 0);
    currentMonday.setUTCDate(
      currentMonday.getUTCDate() - ((currentMonday.getUTCDay() + 6) % 7),
    );
    const limit = new Date(currentMonday);
    limit.setUTCDate(limit.getUTCDate() + 28);
    if (startDate < currentMonday || startDate >= limit)
      throw new AppError(
        400,
        "SCHEDULE_PUBLICATION_OUT_OF_RANGE",
        "Only the current and next three weeks may be published",
      );
    await this.catalogRepository.ensureScheduleResourceGuard();
    return this.unitOfWork.execute(async ({ session, recordAudit }) => {
      const resource =
        await this.catalogRepository.incrementScheduleResourceGuard({
          session,
        });
      const draft = await this.scheduleRepository.findDraft(week.data, {
        session,
      });
      if (!draft || draft.revision !== parsed.data.expectedRevision)
        throw new AppError(
          409,
          "SCHEDULE_REVISION_CONFLICT",
          "Schedule draft has changed; reload it before publishing",
        );
      const snapshot = await this.snapshotProvider.read(week.data, { session });
      const validation = validateSchedule({
        weekStart: week.data,
        schoolYear: snapshot.schoolYear,
        slots: draft.slots,
        groups: snapshot.groups,
        rooms: snapshot.rooms,
        teachers: snapshot.teachers,
        program: snapshot.program,
      });
      if (!validation.valid)
        throw new AppError(
          422,
          "SCHEDULE_NOT_PUBLISHABLE",
          "Schedule contains validation violations",
          validation.violations,
        );
      const publishedAt = this.clock.now();
      const result = await this.scheduleRepository.publish({
        weekStart: week.data,
        expectedRevision: draft.revision,
        session,
        published: {
          revision: draft.revision,
          publishedAt,
          publishedById: actor.id,
          resourceRevision: resource.revision,
          slots: draft.slots,
        },
      });
      if (!result)
        throw new AppError(
          409,
          "SCHEDULE_REVISION_CONFLICT",
          "Schedule draft changed while publishing",
        );
      await recordAudit({
        actorId: actor.id,
        requestId,
        action: "schedule.publish",
        entityType: "SCHEDULE",
        entityId: week.data,
        after: {
          weekStart: week.data,
          revision: draft.revision,
          resourceRevision: resource.revision,
        },
        safeFields: ["weekStart", "revision", "resourceRevision"],
      });
      return result.published;
    });
  }

  async getPublished(weekStart, actor) {
    this.authorizer.assertPermission(actor, PERMISSIONS.SCHEDULES_READ);
    const week = scheduleWeekSchema.safeParse(weekStart);
    if (!week.success)
      throw new AppError(
        400,
        "INVALID_SCHEDULE_WEEK",
        "Schedule week is invalid",
      );
    const schedule = await this.scheduleRepository.findPublished(week.data);
    if (!schedule)
      throw new AppError(
        404,
        "PUBLISHED_SCHEDULE_NOT_FOUND",
        "Published schedule not found",
      );
    let allowedGroupIds = null;
    if (actor.roles.includes(ROLES.PARENT)) {
      allowedGroupIds = new Set(
        await this.guardianGroupsReader.findActiveGroupIds(actor.id),
      );
    } else if (
      actor.roles.includes(ROLES.EDUCATOR) ||
      actor.roles.includes(ROLES.ASSISTANT)
    ) {
      const positions = [];
      if (actor.roles.includes(ROLES.EDUCATOR)) positions.push("educator");
      if (actor.roles.includes(ROLES.ASSISTANT)) positions.push("assistant");
      allowedGroupIds = new Set(
        await this.groupRepository.findActiveGroupIds({
          personId: actor.id,
          positions,
        }),
      );
    }
    const slots = schedule.published.slots.filter((slot) => {
      if (allowedGroupIds) return allowedGroupIds.has(slot.groupId);
      if (actor.roles.includes(ROLES.TEACHER))
        return slot.teacherId === actor.id;
      return true;
    });
    return { ...schedule.published, weekStart: schedule.weekStart, slots };
  }
}
