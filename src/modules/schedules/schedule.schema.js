import { z as zod } from "../../openapi/zod.js";

const objectId = zod.string().regex(/^[a-f\d]{24}$/i);

export const scheduleWeekSchema = zod.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const scheduleSlotSchema = zod.strictObject({
  id: zod.string().trim().min(1).max(80),
  groupId: objectId,
  roomId: objectId,
  teacherId: objectId,
  subjectCode: zod.string().regex(/^[A-Z][A-Z0-9_]*$/),
  weekday: zod.number().int().min(1).max(5),
  startTime: zod.string().regex(/^\d{2}:\d{2}$/),
  endTime: zod.string().regex(/^\d{2}:\d{2}$/),
});

export const updateScheduleDraftSchema = zod
  .strictObject({
    expectedRevision: zod.number().int().safe().min(0),
    slots: zod.array(scheduleSlotSchema).max(2000),
  })
  .superRefine(({ slots }, context) => {
    const ids = new Set();
    for (const [index, slot] of slots.entries()) {
      if (ids.has(slot.id))
        context.addIssue({
          code: "custom",
          path: ["slots", index, "id"],
          message: "Slot IDs must be unique within a schedule draft",
        });
      ids.add(slot.id);
    }
  });
