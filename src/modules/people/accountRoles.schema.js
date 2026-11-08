import { z as zod } from "../../openapi/zod.js";
import { ACCOUNT_ROLE } from "./person.constants.js";

export const assignAccountRolesSchema = zod
  .strictObject({
    roles: zod
      .array(zod.enum(Object.values(ACCOUNT_ROLE)))
      .min(1)
      .refine((roles) => new Set(roles).size === roles.length, {
        message: "Ролі не повинні повторюватися",
      }),
  })
  .meta({ id: "AssignAccountRolesInput" });

export const accountRolesResponseSchema = zod
  .strictObject({
    data: zod.strictObject({
      personId: zod.string(),
      roles: zod.array(zod.enum(Object.values(ACCOUNT_ROLE))),
    }),
  })
  .meta({ id: "AccountRolesResponse" });
