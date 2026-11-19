import {
  ACCOUNT_ROLE,
  PERSON_STATUS,
} from "../src/modules/people/person.constants.js";
import { passwordHasher } from "../src/modules/auth/passwords.js";
import { MIN_PASSWORD_LENGTH } from "../src/modules/auth/auth.constants.js";

export const demoParentFixtures = Object.freeze([
  Object.freeze({
    key: "parent-01",
    email: "demo.parent1@example.test",
    firstName: "Demo",
    lastName: "Parent One",
  }),
  Object.freeze({
    key: "parent-02",
    email: "demo.parent2@example.test",
    firstName: "Demo",
    lastName: "Parent Two",
  }),
]);

/** Provision deterministic synthetic parent accounts without resetting existing data. */
export async function ensureDemoParents({
  personRepository,
  unitOfWork,
  password = process.env.DEMO_PARENT_PASSWORD,
  hasher = passwordHasher,
  actorId,
  requestId = "task-039-demo-seed",
}) {
  if (!personRepository || !unitOfWork || !actorId) {
    throw new TypeError(
      "personRepository, unitOfWork, and actorId are required",
    );
  }
  if (typeof password !== "string" || password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(
      "DEMO_PARENT_PASSWORD must be set to at least 12 characters",
    );
  }

  const results = [];
  for (const fixture of demoParentFixtures) {
    const existing = await personRepository.findAccountByEmail(fixture.email);
    if (existing) {
      if (!existing.account.roles.includes(ACCOUNT_ROLE.PARENT)) {
        throw new Error(
          `Demo identity ${fixture.key} is already used by a non-parent account`,
        );
      }
      results.push({ key: fixture.key, id: existing.id, created: false });
      continue;
    }

    const passwordHash = await hasher.hash(password);
    try {
      const person = await unitOfWork.execute(
        async ({ session, recordAudit }) => {
          const created = await personRepository.insert(
            {
              firstName: fixture.firstName,
              lastName: fixture.lastName,
              status: PERSON_STATUS.ACTIVE,
              account: {
                email: fixture.email,
                passwordHash,
                roles: [ACCOUNT_ROLE.PARENT],
                enabled: true,
                tokenVersion: 0,
              },
            },
            { session },
          );
          await recordAudit({
            actorId,
            requestId,
            action: "demo.parent.provision",
            entityType: "PERSON",
            entityId: created.id,
            after: { role: ACCOUNT_ROLE.PARENT },
            safeFields: ["role"],
          });
          return created;
        },
      );
      results.push({ key: fixture.key, id: person.id, created: true });
    } catch (error) {
      if (error?.code !== 11000) throw error;
      const raced = await personRepository.findAccountByEmail(fixture.email);
      if (!raced?.account.roles.includes(ACCOUNT_ROLE.PARENT)) throw error;
      results.push({ key: fixture.key, id: raced.id, created: false });
    }
  }
  return results;
}
