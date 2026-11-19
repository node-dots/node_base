import { z as zod } from "zod";

const authenticationEnvironment = zod.object({
  JWT_SECRET: zod.string().min(32).max(4096),
  JWT_ISSUER: zod.string().url().max(512),
  JWT_AUDIENCE: zod.string().min(1).max(256),
});

export function readAuthenticationConfig(environment = process.env) {
  const result = authenticationEnvironment.safeParse(environment);
  if (!result.success) {
    const fields = result.error.issues
      .map((issue) => issue.path.join("."))
      .filter(Boolean)
      .join(", ");
    throw new Error(`Некоректні налаштування автентифікації: ${fields}`);
  }

  if (Buffer.byteLength(result.data.JWT_SECRET, "utf8") < 32) {
    throw new Error("JWT_SECRET має містити щонайменше 32 байти UTF-8");
  }

  return Object.freeze({
    secret: result.data.JWT_SECRET,
    issuer: result.data.JWT_ISSUER,
    audience: result.data.JWT_AUDIENCE,
  });
}
