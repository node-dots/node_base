import {
  AppError,
  BusinessError,
  ResourceNotFoundError,
} from "../../utils/errors.js";
import {
  ACCOUNT_ROLE,
  EMPLOYEE_STATUS,
  PERSON_ERROR_CODES,
} from "./person.constants.js";
import { PERMISSIONS } from "../../utils/access/permissions.js";
import { CATALOG_KIND } from "../catalog/catalog.constants.js";

export const ACCOUNT_ROLES_ERROR_CODES = Object.freeze({
  INVALID_ROLES: "INVALID_ACCOUNT_ROLES",
  EMPLOYEE_PROFILE_REQUIRED: "EMPLOYEE_PROFILE_REQUIRED",
  LAST_ADMIN_REQUIRED: "LAST_ADMIN_REQUIRED",
  ACCOUNT_CHANGED: "ACCOUNT_CHANGED",
});

async function assertRolePrerequisites(person, roles, settingsRepository) {
  const positionByRole = {
    [ACCOUNT_ROLE.TEACHER]: "TEACHER",
    [ACCOUNT_ROLE.EDUCATOR]: "EDUCATOR",
    [ACCOUNT_ROLE.ASSISTANT]: "ASSISTANT",
  };
  for (const role of roles) {
    const requiredPosition = positionByRole[role];
    if (
      requiredPosition &&
      (person.employee?.positionCode !== requiredPosition ||
        person.employee?.status !== EMPLOYEE_STATUS.ACTIVE)
    ) {
      throw new BusinessError(
        ACCOUNT_ROLES_ERROR_CODES.EMPLOYEE_PROFILE_REQUIRED,
        `Для ролі ${role} потрібен активний профіль працівника ${requiredPosition}`,
      );
    }
    if (
      role === ACCOUNT_ROLE.TEACHER &&
      (typeof person.employee?.subjectCode !== "string" ||
        !(await settingsRepository.findActiveByCode(
          CATALOG_KIND.SUBJECT,
          person.employee.subjectCode,
        )))
    ) {
      throw new BusinessError(
        ACCOUNT_ROLES_ERROR_CODES.EMPLOYEE_PROFILE_REQUIRED,
        "Для ролі TEACHER потрібен профіль із рівно однією активною дисципліною",
      );
    }
  }
}

export class AccountRolesService {
  constructor({
    authorizer,
    personRepository,
    settingsRepository,
    unitOfWork,
  }) {
    this.authorizer = authorizer;
    this.personRepository = personRepository;
    this.settingsRepository = settingsRepository;
    this.unitOfWork = unitOfWork;
    this.authorizer.assertKnown(PERMISSIONS.ROLES_ASSIGN);
  }

  async assign({ personId, roles }, actor, requestId) {
    this.authorizer.assertPermission(actor, PERMISSIONS.ROLES_ASSIGN);
    if (
      !Array.isArray(roles) ||
      roles.length === 0 ||
      new Set(roles).size !== roles.length ||
      roles.some((role) => !Object.values(ACCOUNT_ROLE).includes(role))
    ) {
      throw new BusinessError(
        ACCOUNT_ROLES_ERROR_CODES.INVALID_ROLES,
        "Потрібен непорожній набір відомих ролей без повторів",
      );
    }

    await this.settingsRepository.ensureAdminGuard();
    return this.unitOfWork.execute(async ({ session, recordAudit }) => {
      await this.settingsRepository.incrementAdminGuard({ session });
      const current = await this.personRepository.findAccountById(personId, {
        session,
      });
      if (!current?.account) {
        throw new ResourceNotFoundError(
          PERSON_ERROR_CODES.NOT_FOUND,
          "Обліковий запис не знайдено",
        );
      }
      await assertRolePrerequisites(current, roles, this.settingsRepository);

      const removesAdmin =
        current.account.enabled &&
        current.account.roles.includes(ACCOUNT_ROLE.ADMIN) &&
        !roles.includes(ACCOUNT_ROLE.ADMIN);
      if (
        removesAdmin &&
        (await this.personRepository.countEnabledAdmins({ session })) <= 1
      ) {
        throw new AppError(
          409,
          ACCOUNT_ROLES_ERROR_CODES.LAST_ADMIN_REQUIRED,
          "Не можна прибрати роль останнього активного адміністратора",
        );
      }

      const updated = await this.personRepository.updateAccountRoles(
        {
          personId,
          roles,
          expectedTokenVersion: current.account.tokenVersion,
        },
        { session },
      );
      if (!updated) {
        throw new AppError(
          409,
          ACCOUNT_ROLES_ERROR_CODES.ACCOUNT_CHANGED,
          "Обліковий запис змінився; повторіть запит",
        );
      }

      await recordAudit({
        actorId: actor.id,
        requestId,
        action: "account.roles.assign",
        entityType: "PERSON",
        entityId: updated.id,
        before: { roles: current.account.roles },
        after: { roles: updated.account.roles },
        safeFields: ["roles"],
      });
      return { personId: updated.id, roles: [...updated.account.roles] };
    });
  }
}
