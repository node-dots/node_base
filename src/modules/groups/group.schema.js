import {
  GROUP_LIMITS,
  GROUP_STATUS,
  GROUP_PAGINATION,
} from "./group.constants.js";
import { z as zod } from "../../openapi/zod.js";

// Один контракт задає HTTP-валідацію та опис входу для Swagger.
export const createGroupSchema = zod
  .strictObject({
    name: zod
      .string()
      .trim()
      .min(GROUP_LIMITS.MIN_NAME_LENGTH, "Вкажіть назву групи")
      .max(
        GROUP_LIMITS.MAX_NAME_LENGTH,
        "Назва групи не може перевищувати 100 символів",
      )
      .meta({
        description: "Назва після видалення пробілів на початку й у кінці.",
        example: "Мандрівники",
      }),
    ageCategory: zod
      .number()
      .int("Вікова категорія має бути цілим числом")
      .min(
        GROUP_LIMITS.MIN_AGE_CATEGORY,
        "Мінімальна вікова категорія — 2 роки",
      )
      .max(
        GROUP_LIMITS.MAX_AGE_CATEGORY,
        "Максимальна вікова категорія — 5 років",
      )
      .meta({
        description:
          "Тимчасова числова категорія; посилання на catalog ще не реалізовано.",
        example: 4,
      }),
    capacity: zod
      .number()
      .int("Кількість місць має бути цілим числом")
      .min(GROUP_LIMITS.MIN_CAPACITY, "У групі має бути хоча б одне місце")
      .max(GROUP_LIMITS.MAX_CAPACITY, "У групі може бути максимум 20 місць")
      .meta({ description: "Кількість місць у чернетці.", example: 20 }),
  })
  .meta({ id: "CreateGroupInput" });

// Описуємо публічний DTO, а не внутрішній документ Mongoose.
export const groupSchema = createGroupSchema
  .extend({
    id: zod
      .string()
      .regex(/^[a-f0-9]{24}$/)
      .meta({
        description: "Строкове представлення MongoDB ObjectId.",
        example: "000000000000000000000001",
      }),
    status: zod
      .enum(Object.values(GROUP_STATUS))
      .meta({ description: "Чернетка; активацію ще не реалізовано." }),
  })
  .meta({ id: "Group" })
  .extend({
    schoolYear: zod.string().optional(),
    ageCategoryId: zod.string().optional(),
    roomId: zod.string().optional(),
    educatorId: zod.string().optional(),
    assistantId: zod.string().optional(),
    occupiedSeats: zod.number().int().min(0),
  })
  .meta({ id: "Group" });

export const groupResponseSchema = zod
  .strictObject({ data: groupSchema })
  .meta({ id: "GroupResponse" });
export const groupListResponseSchema = zod
  .strictObject({
    data: zod.array(groupSchema),
    meta: zod.strictObject({
      page: zod.number().int().min(1),
      pageSize: zod.number().int().min(1).max(GROUP_PAGINATION.MAX_PAGE_SIZE),
      total: zod.number().int().min(0),
      totalPages: zod.number().int().min(0),
    }),
  })
  .meta({
    id: "GroupListResponse",
    description: "Сторінка груп із MongoDB та загальна кількість записів.",
  });

export const ageSummarySchema = zod
  .strictObject({
    ageCategory: createGroupSchema.shape.ageCategory,
    groupsCount: zod.number().int().min(0),
    totalCapacity: zod.number().int().min(0),
  })
  .meta({ id: "AgeSummary" });
export const ageSummaryResponseSchema = zod
  .strictObject({ data: zod.array(ageSummarySchema) })
  .meta({ id: "AgeSummaryResponse" });

// Формат ID перевіряє repository: невідомий або некоректний ID дає 404.
export const groupIdParamsSchema = zod.object({
  id: zod.string().meta({
    description:
      "MongoDB ObjectId. Невідомий рядковий ID або некоректний формат повертає 404.",
  }),
});

// Query-параметри надходять як рядки: спочатку перевіряємо формат.
const positiveIntegerQuerySchema = zod
  .string()
  .regex(/^[1-9]\d*$/, "Вкажіть додатне ціле число")
  .pipe(zod.coerce.number().int().min(1));

// Перевірені значення вже мають числовий тип.
export const groupListQuerySchema = zod.strictObject({
  page: positiveIntegerQuerySchema
    .default(GROUP_PAGINATION.DEFAULT_PAGE)
    .openapi({
      type: "integer",
      minimum: 1,
      default: GROUP_PAGINATION.DEFAULT_PAGE,
      description: "Номер сторінки, починаючи з 1.",
    }),

  pageSize: positiveIntegerQuerySchema
    .pipe(zod.number().max(GROUP_PAGINATION.MAX_PAGE_SIZE))
    .default(GROUP_PAGINATION.DEFAULT_PAGE_SIZE)
    .openapi({
      type: "integer",
      minimum: 1,
      maximum: GROUP_PAGINATION.MAX_PAGE_SIZE,
      default: GROUP_PAGINATION.DEFAULT_PAGE_SIZE,
      description: "Максимальна кількість груп на сторінці.",
    }),
});
