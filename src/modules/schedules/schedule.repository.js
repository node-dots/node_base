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
  };
}

export class ScheduleRepository {
  constructor({ scheduleModel }) {
    if (!scheduleModel) throw new TypeError("scheduleModel is required");
    this.scheduleModel = scheduleModel;
  }

  async findDraft(weekStart) {
    const document = await this.scheduleModel.findOne({ weekStart }).lean();
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
}
