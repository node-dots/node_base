import { z as zod } from "../../openapi/zod.js";
import { BCRYPT_MAX_BYTES, MIN_PASSWORD_LENGTH } from "./auth.constants.js";

const passwordSchema = zod
  .string()
  .min(1)
  .superRefine((value, context) => {
    if (Buffer.byteLength(value, "utf8") > BCRYPT_MAX_BYTES) {
      context.addIssue({
        code: "custom",
        message: `Пароль не може перевищувати ${BCRYPT_MAX_BYTES} байтів UTF-8`,
      });
    }
  });

const newPasswordSchema = zod
  .string()
  .min(MIN_PASSWORD_LENGTH)
  .superRefine((value, context) => {
    if (Buffer.byteLength(value, "utf8") > BCRYPT_MAX_BYTES) {
      context.addIssue({
        code: "custom",
        message: `Пароль не може перевищувати ${BCRYPT_MAX_BYTES} байтів UTF-8`,
      });
    }
  });

export const loginInputSchema = zod
  .strictObject({
    email: zod.string().trim().toLowerCase().email().max(254),
    password: passwordSchema,
  })
  .meta({ id: "LoginInput" });

export const changePasswordInputSchema = zod
  .strictObject({
    currentPassword: passwordSchema,
    newPassword: newPasswordSchema,
  })
  .meta({ id: "ChangePasswordInput" });

export const accessTokenResponseSchema = zod
  .strictObject({
    data: zod.strictObject({
      accessToken: zod.string(),
      tokenType: zod.literal("Bearer"),
      expiresIn: zod.literal(1800),
    }),
  })
  .meta({ id: "AccessTokenResponse" });

export const actorResponseSchema = zod
  .strictObject({
    data: zod.strictObject({
      id: zod.string(),
      roles: zod.array(zod.string()),
    }),
  })
  .meta({ id: "ActorResponse" });

export const passwordChangedResponseSchema = zod
  .strictObject({
    data: zod.strictObject({
      status: zod.literal("PASSWORD_CHANGED"),
    }),
  })
  .meta({ id: "PasswordChangedResponse" });

export const sessionsRevokedResponseSchema = zod
  .strictObject({
    data: zod.strictObject({
      status: zod.literal("SESSIONS_REVOKED"),
    }),
  })
  .meta({ id: "SessionsRevokedResponse" });
