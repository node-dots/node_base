import { z as zod } from "../../openapi/zod.js";
import { scenarioSchema } from "./scenario.schema.js";

const code = zod.string().regex(/^[A-Z][A-Z0-9_]*$/);
const objectId = zod.string().min(1).max(80);
const time = zod.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);
const availability = zod
  .array(
    zod.strictObject({
      weekday: zod.number().int().min(1).max(5),
      startTime: time,
      endTime: time,
    }),
  )
  .max(40);

const baseConfigurationSearchSchema = zod.strictObject({
  weekStart: zod.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  schoolYear: zod.string().regex(/^\d{4}-\d{4}$/),
  groupRanges: zod
    .array(
      zod
        .strictObject({
          ageCode: code,
          age: zod.number().int().min(2).max(5),
          children: zod.number().int().min(0).max(500),
          minGroups: zod.number().int().min(0).max(15),
          maxGroups: zod.number().int().min(0).max(15),
        })
        .refine(
          (range) => range.minGroups <= range.maxGroups,
          "minGroups cannot exceed maxGroups",
        ),
    )
    .min(1)
    .max(4),
  rooms: zod
    .array(
      zod.strictObject({
        id: objectId,
        active: zod.boolean(),
        roomType: zod.enum(["GROUP", "SERVICE"]),
        capacity: zod.number().int().min(1).max(100),
      }),
    )
    .max(100),
  teacherVariants: zod
    .array(
      zod.strictObject({
        id: objectId,
        teachers: zod
          .array(
            zod.strictObject({ id: objectId, subjectCode: code, availability }),
          )
          .max(100),
      }),
    )
    .min(1)
    .max(50),
  program: zod
    .array(
      zod.strictObject({
        subjectCode: code,
        sessionsPerWeek: zod.number().int().min(1).max(20),
        durationMinutes: zod.number().int().min(15).max(480),
      }),
    )
    .min(1)
    .max(50),
  fixedStaff: zod
    .array(
      zod.strictObject({
        id: objectId,
        salaryMinor: zod.number().int().safe().nonnegative(),
      }),
    )
    .max(100),
  financial: scenarioSchema.omit({ groups: true, staff: true }),
});

export const configurationSearchSchema =
  baseConfigurationSearchSchema.superRefine((input, context) => {
    const monday = new Date(`${input.weekStart}T00:00:00.000Z`);
    if (
      Number.isNaN(monday.valueOf()) ||
      monday.toISOString().slice(0, 10) !== input.weekStart ||
      monday.getUTCDay() !== 1
    )
      context.addIssue({
        code: "custom",
        path: ["weekStart"],
        message: "weekStart must be a real Monday",
      });
    if (input.groupRanges.reduce((sum, range) => sum + range.minGroups, 0) > 15)
      context.addIssue({
        code: "custom",
        path: ["groupRanges"],
        message: "minimum group counts exceed the 15 group limit",
      });
    const unique = (values, path, message) => {
      if (new Set(values).size !== values.length)
        context.addIssue({ code: "custom", path, message });
    };
    unique(
      input.groupRanges.map((range) => range.ageCode),
      ["groupRanges"],
      "ageCode values must be unique",
    );
    unique(
      input.rooms.map((room) => room.id),
      ["rooms"],
      "room IDs must be unique",
    );
    unique(
      input.teacherVariants.map((variant) => variant.id),
      ["teacherVariants"],
      "teacher variant IDs must be unique",
    );
    unique(
      input.program.map((lesson) => lesson.subjectCode),
      ["program"],
      "program subjects must be unique",
    );
    for (const [index, variant] of input.teacherVariants.entries())
      unique(
        variant.teachers.map((teacher) => teacher.id),
        ["teacherVariants", index, "teachers"],
        "teacher IDs must be unique within a variant",
      );
    const financialAges = new Map(
      input.financial.ages.map((age) => [age.code, age.age]),
    );
    for (const [index, range] of input.groupRanges.entries())
      if (financialAges.get(range.ageCode) !== range.age)
        context.addIssue({
          code: "custom",
          path: ["groupRanges", index, "ageCode"],
          message: "Each group range must match a financial age code and age",
        });
    for (const age of input.financial.ages)
      if (!input.groupRanges.some((range) => range.ageCode === age.code))
        context.addIssue({
          code: "custom",
          path: ["financial", "ages"],
          message: "Every financial age needs a group range",
        });
  });
