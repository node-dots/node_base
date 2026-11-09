function toSchedule(document) {
  return {
    weekStart: document.weekStart,
    revision: document.revision,
    slots: document.slots.map((slot) => ({
      id: slot.id,
      groupId: slot.groupId.toString(),
      roomId: slot.roomId.toString(),
      teacherId: slot.teacherId.toString(),
      subjectCode: slot.subjectCode,
      weekday: slot.weekday,
      startTime: slot.startTime,
      endTime: slot.endTime,
    })),
    updatedById: document.updatedById.toString(),
    updatedAt: new Date(document.updatedAt),
    ...(document.published
      ? {
          published: {
            revision: document.published.revision,
            publishedAt: new Date(document.published.publishedAt),
            publishedById: document.published.publishedById.toString(),
            resourceRevision: document.published.resourceRevision,
            slots: document.published.slots.map((slot) => ({
              id: slot.id,
              groupId: slot.groupId.toString(),
              roomId: slot.roomId.toString(),
              teacherId: slot.teacherId.toString(),
              subjectCode: slot.subjectCode,
              weekday: slot.weekday,
              startTime: slot.startTime,
              endTime: slot.endTime,
            })),
          },
        }
      : {}),
  };
}

export class ScheduleRepository {
  constructor({ scheduleModel }) {
    if (!scheduleModel) throw new TypeError("scheduleModel is required");
    this.scheduleModel = scheduleModel;
  }

  async findDraft(weekStart, { session } = {}) {
    const document = await this.scheduleModel
      .findOne({ weekStart })
      .session(session ?? null)
      .lean();
    return document ? toSchedule(document) : null;
  }

  async updateDraft({ weekStart, expectedRevision, slots, updatedById }) {
    const filter =
      expectedRevision === 0
        ? { weekStart, revision: 0 }
        : { weekStart, revision: expectedRevision };
    const document = await this.scheduleModel
      .findOneAndUpdate(
        filter,
        {
          $set: { weekStart, slots, updatedById },
          $inc: { revision: 1 },
        },
        {
          new: true,
          upsert: expectedRevision === 0,
          runValidators: true,
          setDefaultsOnInsert: true,
        },
      )
      .lean();
    return document ? toSchedule(document) : null;
  }

  async publish({ weekStart, expectedRevision, published, session }) {
    const document = await this.scheduleModel
      .findOneAndUpdate(
        { weekStart, revision: expectedRevision },
        { $set: { published } },
        { new: true, runValidators: true, session },
      )
      .lean();
    return document ? toSchedule(document) : null;
  }

  async findPublished(weekStart) {
    const document = await this.scheduleModel
      .findOne({ weekStart, published: { $exists: true } })
      .lean();
    return document ? toSchedule(document) : null;
  }
}
