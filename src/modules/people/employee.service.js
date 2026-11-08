import { AppError, ResourceNotFoundError } from "../../utils/errors.js";
import { CATALOG_KIND, POSITION_CODE } from "../catalog/catalog.constants.js";
import { PERMISSIONS } from "../../utils/access/permissions.js";
import { ROLES } from "../../utils/access/roles.js";
import { EMPLOYEE_STATUS } from "./person.constants.js";
import { employeeProfileSchema } from "./employee.schema.js";
import { toEmployeeProfileDto } from "./person.dto.js";

export class EmployeeService {
  constructor({
    personRepository,
    catalogRepository,
    groupRepository,
    unitOfWork,
    authorizer,
  }) {
    Object.assign(this, {
      personRepository,
      catalogRepository,
      groupRepository,
      unitOfWork,
      authorizer,
    });
    authorizer.assertKnown(PERMISSIONS.PEOPLE_READ);
    authorizer.assertKnown(PERMISSIONS.PEOPLE_UPDATE);
    authorizer.assertKnown(PERMISSIONS.EMPLOYEE_AVAILABILITY_UPDATE);
  }

  async assertReferences(employee) {
    if (
      !(await this.catalogRepository.findActiveByCode(
        CATALOG_KIND.POSITION,
        employee.positionCode,
      ))
    ) {
      throw new AppError(
        422,
        "POSITION_NOT_ACTIVE",
        "Employee position must be active in catalog",
      );
    }
    if (employee.positionCode === POSITION_CODE.TEACHER) {
      if (
        !(await this.catalogRepository.findActiveByCode(
          CATALOG_KIND.SUBJECT,
          employee.subjectCode,
        ))
      ) {
        throw new AppError(
          422,
          "SUBJECT_NOT_ACTIVE",
          "Teacher subject must be active in catalog",
        );
      }
    }
  }

  parseProfile(employee) {
    try {
      return employeeProfileSchema.parse(employee);
    } catch (error) {
      throw new AppError(
        400,
        "INVALID_EMPLOYEE_PROFILE",
        "Employee profile is invalid",
        error.issues,
      );
    }
  }

  async get(personId, actor) {
    const isSelf =
      actor.id === personId &&
      actor.roles.some((role) =>
        [ROLES.TEACHER, ROLES.EDUCATOR, ROLES.ASSISTANT].includes(role),
      );
    if (!isSelf)
      this.authorizer.assertPermission(actor, PERMISSIONS.PEOPLE_READ);
    const person = await this.personRepository.findById(personId);
    if (!person?.employee)
      throw new ResourceNotFoundError(
        "EMPLOYEE_NOT_FOUND",
        "Employee profile not found",
      );
    return toEmployeeProfileDto(person, actor.roles.includes(ROLES.ADMIN));
  }

  async update(personId, input, actor, requestId) {
    const isSelf =
      actor.id === personId &&
      actor.roles.some((role) =>
        [ROLES.TEACHER, ROLES.EDUCATOR, ROLES.ASSISTANT].includes(role),
      );
    let before = await this.personRepository.findById(personId);
    if (!before)
      throw new ResourceNotFoundError("PERSON_NOT_FOUND", "Person not found");
    let next;
    if (
      isSelf &&
      !actor.roles.some((role) => [ROLES.ADMIN, ROLES.MANAGER].includes(role))
    ) {
      this.authorizer.assertPermission(
        actor,
        PERMISSIONS.EMPLOYEE_AVAILABILITY_UPDATE,
      );
      if (
        Object.keys(input).length !== 1 ||
        !Object.hasOwn(input, "availability")
      ) {
        throw new AppError(
          403,
          "EMPLOYEE_FIELD_FORBIDDEN",
          "Employees may update only their availability",
        );
      }
      if (!before.employee)
        throw new ResourceNotFoundError(
          "EMPLOYEE_NOT_FOUND",
          "Employee profile not found",
        );
      next = this.parseProfile({
        ...before.employee,
        availability: input.availability,
      });
    } else {
      this.authorizer.assertPermission(actor, PERMISSIONS.PEOPLE_UPDATE);
      if (
        !actor.roles.includes(ROLES.ADMIN) &&
        Object.hasOwn(input, "salaryMinor")
      ) {
        throw new AppError(
          403,
          "EMPLOYEE_FIELD_FORBIDDEN",
          "Salary fields are restricted to administrators",
        );
      }
      next = this.parseProfile({
        ...(before.employee ?? {}),
        ...input,
      });
    }
    await this.assertReferences(next);
    if (
      next.status === EMPLOYEE_STATUS.TERMINATED &&
      before.employee?.status !== EMPLOYEE_STATUS.TERMINATED
    ) {
      const assignments =
        await this.groupRepository.findActiveEmployeeAssignments(personId);
      if (assignments.length)
        throw new AppError(
          409,
          "EMPLOYEE_ASSIGNED_TO_ACTIVE_GROUP",
          "Remove or replace the employee assignment before termination",
        );
    }

    await this.catalogRepository.ensureEmployeeResourceGuard();
    const updated = await this.unitOfWork.execute(
      async ({ session, recordAudit }) => {
        await this.catalogRepository.incrementEmployeeResourceGuard({
          session,
        });
        const person = await this.personRepository.updateEmployee(
          personId,
          next,
          { session },
        );
        if (!person)
          throw new ResourceNotFoundError(
            "PERSON_NOT_FOUND",
            "Person not found",
          );
        await recordAudit({
          actorId: actor.id,
          requestId,
          action: "employee.profile.update",
          entityType: "PERSON",
          entityId: personId,
          before: { employeeProfileUpdated: false },
          after: { employeeProfileUpdated: true },
          safeFields: ["employeeProfileUpdated"],
        });
        return person;
      },
    );
    return toEmployeeProfileDto(updated, actor.roles.includes(ROLES.ADMIN));
  }
}
