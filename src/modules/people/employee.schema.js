import { z as zod } from "../../openapi/zod.js";
import { parseCalendarDate } from "../../utils/calendar.js";
import { EMPLOYEE_STATUS } from "./person.constants.js";
import { POSITION_CODE } from "../catalog/catalog.constants.js";

const calendarDate = zod.string().refine((value) => {
  try {
    parseCalendarDate(value);
    return true;
  } catch {
    return false;
  }
}, "Expected a valid YYYY-MM-DD calendar date");
const time = zod.string().regex(/^(?:(?:09|1[0-6]):(?:00|15|30|45)|17:00)$/);
const availabilityWindow = zod.strictObject({
  weekday: zod.number().int().min(1).max(5),
  startTime: time,
  endTime: time,
});

export const employeeProfileSchema = zod
  .strictObject({
    positionCode: zod.enum(Object.values(POSITION_CODE)),
    status: zod
      .enum(Object.values(EMPLOYEE_STATUS))
      .default(EMPLOYEE_STATUS.ACTIVE),
    startedAt: calendarDate,
    endedAt: calendarDate.optional(),
    salaryMinor: zod.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
    subjectCode: zod
      .string()
      .regex(/^[A-Z][A-Z0-9_]*$/)
      .optional(),
    availability: zod.array(availabilityWindow).max(20).default([]),
  })
  .superRefine((employee, context) => {
    if (
      employee.positionCode === POSITION_CODE.TEACHER &&
      !employee.subjectCode
    )
      context.addIssue({
        code: "custom",
        path: ["subjectCode"],
        message: "Teacher requires exactly one subject",
      });
    if (employee.positionCode !== POSITION_CODE.TEACHER && employee.subjectCode)
      context.addIssue({
        code: "custom",
        path: ["subjectCode"],
        message: "Only teachers may have a subject",
      });
    if (employee.status === EMPLOYEE_STATUS.TERMINATED && !employee.endedAt)
      context.addIssue({
        code: "custom",
        path: ["endedAt"],
        message: "Terminated employee requires an end date",
      });
    if (employee.status !== EMPLOYEE_STATUS.TERMINATED && employee.endedAt)
      context.addIssue({
        code: "custom",
        path: ["endedAt"],
        message: "Only terminated employees may have an end date",
      });
    if (employee.endedAt && employee.endedAt < employee.startedAt)
      context.addIssue({
        code: "custom",
        path: ["endedAt"],
        message: "End date cannot precede start date",
      });
    const windows = employee.availability;
    const unique = new Set(
      windows.map(
        ({ weekday, startTime, endTime }) =>
          `${weekday}:${startTime}-${endTime}`,
      ),
    );
    if (unique.size !== windows.length)
      context.addIssue({
        code: "custom",
        path: ["availability"],
        message: "Availability windows must be unique",
      });
    windows.forEach((current, index) => {
      if (current.startTime >= current.endTime)
        context.addIssue({
          code: "custom",
          path: ["availability", index],
          message: "Availability window must have positive duration",
        });
      windows.slice(index + 1).forEach((other, offset) => {
        if (
          current.weekday === other.weekday &&
          current.startTime < other.endTime &&
          other.startTime < current.endTime
        )
          context.addIssue({
            code: "custom",
            path: ["availability", index + offset + 1],
            message: "Availability windows must not overlap",
          });
      });
    });
  })
  .meta({ id: "EmployeeProfileInput" });

export const updateEmployeeProfileSchema = zod
  .strictObject({
    positionCode: employeeProfileSchema.shape.positionCode.optional(),
    status: employeeProfileSchema.shape.status.optional(),
    startedAt: employeeProfileSchema.shape.startedAt.optional(),
    endedAt: employeeProfileSchema.shape.endedAt,
    salaryMinor: employeeProfileSchema.shape.salaryMinor.optional(),
    subjectCode: employeeProfileSchema.shape.subjectCode,
    availability: employeeProfileSchema.shape.availability.optional(),
  })
  .refine(
    (value) => Object.keys(value).length > 0,
    "At least one employee field is required",
  );
