import { HTTP_STATUS } from "../../utils/httpConstants.js";
import {
  scheduleWeekSchema,
  updateScheduleDraftSchema,
} from "./schedule.schema.js";
import { z as zod } from "../../openapi/zod.js";

export function registerScheduleDocumentation(registry) {
  registry.register("ScheduleWeek", scheduleWeekSchema);
  registry.register("UpdateScheduleDraftInput", updateScheduleDraftSchema);
  const draftSchema = zod.object({
    weekStart: scheduleWeekSchema,
    revision: zod.number().int().nonnegative(),
    slots: zod.array(zod.object({})),
    updatedById: zod.string().optional(),
    updatedAt: zod.string().nullable(),
  });
  registry.registerPath({
    method: "get",
    path: "/api/v1/schedules/{weekStart}/draft",
    operationId: "getScheduleDraft",
    tags: ["Schedules"],
    security: [{ BearerAuth: [] }],
    responses: {
      [HTTP_STATUS.OK]: {
        description:
          "Returns a schedule draft to authorized staff and teachers.",
        content: {
          "application/json": { schema: zod.object({ data: draftSchema }) },
        },
      },
      [HTTP_STATUS.FORBIDDEN]: { description: "Draft access is forbidden." },
    },
  });
  registry.registerPath({
    method: "put",
    path: "/api/v1/schedules/{weekStart}/draft",
    operationId: "updateScheduleDraft",
    tags: ["Schedules"],
    security: [{ BearerAuth: [] }],
    request: {
      body: {
        required: true,
        content: { "application/json": { schema: updateScheduleDraftSchema } },
      },
    },
    responses: {
      [HTTP_STATUS.OK]: {
        description: "Saves the draft and increments its revision.",
        content: {
          "application/json": { schema: zod.object({ data: draftSchema }) },
        },
      },
      [HTTP_STATUS.CONFLICT]: {
        description: "The expected draft revision is stale.",
      },
      [HTTP_STATUS.PAYLOAD_TOO_LARGE]: {
        description: "Request exceeds 512 KiB.",
      },
      [HTTP_STATUS.FORBIDDEN]: { description: "Draft edit is forbidden." },
    },
  });
}
