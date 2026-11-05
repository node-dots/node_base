import { AppError } from "../../utils/errors.js";
import { PERMISSIONS } from "../../utils/access/permissions.js";
import { ROLES } from "../../utils/access/roles.js";
import { systemClock } from "../../utils/calendar.js";
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
  constructor({ scheduleRepository, authorizer, clock = systemClock }) {
    this.scheduleRepository = scheduleRepository;
    this.authorizer = authorizer;
    this.clock = clock;
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
}
