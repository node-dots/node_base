import { z as zod } from "zod";
import {
  ACCOUNT_ROLE,
  PERSON_LIMITS,
  PERSON_STATUS,
} from "../people/person.constants.js";
import { passwordHasher } from "./passwords.js";
import { BCRYPT_MAX_BYTES, MIN_PASSWORD_LENGTH } from "./auth.constants.js";

function isAdminRolePresent(accountPerson) {
  return accountPerson?.account?.roles?.includes(ACCOUNT_ROLE.ADMIN) === true;
}

const bootstrapEnvironment = zod.object({
  BOOTSTRAP_ADMIN_EMAIL: zod.string().trim().toLowerCase().email().max(254),
  BOOTSTRAP_ADMIN_PASSWORD: zod
    .string()
    .min(MIN_PASSWORD_LENGTH)
    .refine(
      (password) => Buffer.byteLength(password, "utf8") <= BCRYPT_MAX_BYTES,
      `Пароль не може перевищувати ${BCRYPT_MAX_BYTES} байтів UTF-8`,
    ),
  BOOTSTRAP_ADMIN_FIRST_NAME: zod
    .string()
    .trim()
    .min(PERSON_LIMITS.MIN_NAME_LENGTH)
    .max(PERSON_LIMITS.MAX_NAME_LENGTH),
  BOOTSTRAP_ADMIN_LAST_NAME: zod
    .string()
    .trim()
    .min(PERSON_LIMITS.MIN_NAME_LENGTH)
    .max(PERSON_LIMITS.MAX_NAME_LENGTH),
});

export function readBootstrapAdminConfig(environment = process.env) {
  const result = bootstrapEnvironment.safeParse(environment);
  if (!result.success) {
    const fields = result.error.issues
      .map((issue) => issue.path.join("."))
      .filter(Boolean)
      .join(", ");
    throw new Error(`Некоректні параметри bootstrap ADMIN: ${fields}`);
  }
  return Object.freeze(result.data);
}

export async function bootstrapAdmin({
  config,
  personRepository,
  hasher = passwordHasher,
}) {
  if (!config || !personRepository || !hasher) {
    throw new TypeError("config, personRepository, and hasher are required");
  }

  const activeAdmin = await personRepository.findFirstEnabledAdmin();
  if (activeAdmin) return { created: false };

  const existing = await personRepository.findAccountByEmail(
    config.BOOTSTRAP_ADMIN_EMAIL,
  );
  if (existing) {
    if (isAdminRolePresent(existing)) return { created: false };
    throw new Error("Bootstrap email belongs to an existing non-admin account");
  }

  const passwordHash = await hasher.hash(config.BOOTSTRAP_ADMIN_PASSWORD);
  try {
    await personRepository.insert({
      firstName: config.BOOTSTRAP_ADMIN_FIRST_NAME,
      lastName: config.BOOTSTRAP_ADMIN_LAST_NAME,
      status: PERSON_STATUS.ACTIVE,
      account: {
        email: config.BOOTSTRAP_ADMIN_EMAIL,
        passwordHash,
        roles: [ACCOUNT_ROLE.ADMIN],
        enabled: true,
        tokenVersion: 0,
      },
    });
    return { created: true };
  } catch (error) {
    if (error?.code !== 11000) throw error;
    const racedAdmin = await personRepository.findFirstEnabledAdmin();
    if (racedAdmin) return { created: false };
    const racedEmail = await personRepository.findAccountByEmail(
      config.BOOTSTRAP_ADMIN_EMAIL,
    );
    if (racedEmail && isAdminRolePresent(racedEmail)) return { created: false };
    throw new Error("Bootstrap could not create the initial administrator");
  }
}
