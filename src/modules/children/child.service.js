import { AppError, ResourceNotFoundError } from "../../utils/errors.js";
import { PERMISSIONS } from "../../utils/access/permissions.js";
import { ROLES } from "../../utils/access/roles.js";
import { prepareApplicant, prepareChildProfileUpdate } from "./child.rules.js";
import { ChildAccessPolicy } from "./childAccessPolicy.js";
import { ChildViewPolicy } from "./childViewPolicy.js";
import { parentNutritionUpdateSchema } from "./child.schema.js";

const NOT_FOUND = "CHILD_NOT_FOUND";

export class ChildService {
  constructor({
    childRepository,
    personRepository,
    groupAssignmentsReader,
    authorizer,
    unitOfWork,
  }) {
    this.childRepository = childRepository;
    this.personRepository = personRepository;
    this.authorizer = authorizer;
    this.unitOfWork = unitOfWork;
    this.accessPolicy = new ChildAccessPolicy({ groupAssignmentsReader });
    this.viewPolicy = new ChildViewPolicy({ authorizer });
    for (const permission of [
      PERMISSIONS.CHILDREN_READ,
      PERMISSIONS.CHILDREN_CREATE,
      PERMISSIONS.CHILDREN_UPDATE,
      PERMISSIONS.NUTRITION_UPDATE,
    ])
      authorizer.assertKnown(permission);
  }

  async validateGuardians(guardians) {
    if (
      new Set(guardians.map(({ personId }) => personId)).size !==
      guardians.length
    ) {
      throw new AppError(
        400,
        "INVALID_GUARDIANS",
        "Guardian references must be unique",
      );
    }
    for (const { personId } of guardians) {
      const person = await this.personRepository.findById(personId);
      if (!person || person.status !== "ACTIVE") {
        throw new AppError(
          400,
          "INVALID_GUARDIAN",
          "Guardian must reference an active person",
        );
      }
    }
  }

  async createApplicant(input, actor, requestId) {
    this.authorizer.assertPermission(actor, PERMISSIONS.CHILDREN_CREATE);
    const applicant = prepareApplicant(input);
    await this.validateGuardians(applicant.guardians);
    return this.unitOfWork.execute(async ({ session, recordAudit }) => {
      const child = await this.childRepository.insertApplicant(applicant, {
        session,
      });
      await recordAudit({
        actorId: actor.id,
        requestId,
        action: "child.applicant.create",
        entityType: "CHILD",
        entityId: child.id,
        after: { status: child.status },
        safeFields: ["status"],
      });
      return child;
    });
  }

  async list({ page, pageSize }, actor) {
    this.authorizer.assertPermission(actor, PERMISSIONS.CHILDREN_READ);
    const scope = await this.accessPolicy.readScope(actor);
    const { children, total } = await this.childRepository.findPageInScope({
      scope,
      page,
      pageSize,
    });
    return {
      children: children.map((child) =>
        this.viewPolicy.toReadDto(child, actor),
      ),
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  async get(childId, actor) {
    this.authorizer.assertPermission(actor, PERMISSIONS.CHILDREN_READ);
    const scope = await this.accessPolicy.readScope(actor);
    const child = await this.childRepository.findByIdInScope(childId, scope);
    if (!child) throw new ResourceNotFoundError(NOT_FOUND, "Child not found");
    return this.viewPolicy.toReadDto(child, actor);
  }

  async update(childId, input, actor, requestId) {
    const isGuardian =
      actor.roles.includes(ROLES.PARENT) &&
      !actor.roles.some((role) => [ROLES.ADMIN, ROLES.MANAGER].includes(role));
    let update;
    if (isGuardian) {
      this.authorizer.assertPermission(actor, PERMISSIONS.NUTRITION_UPDATE);
      if (Object.keys(input).length !== 1 || !Object.hasOwn(input, "food")) {
        throw new AppError(
          403,
          "FIELD_UPDATE_FORBIDDEN",
          "Parents may update only nutrition fields",
        );
      }
      let parentUpdate;
      try {
        parentUpdate = parentNutritionUpdateSchema.parse(input);
      } catch (error) {
        throw new AppError(
          400,
          "INVALID_NUTRITION_UPDATE",
          "Only allowed nutrition fields may be changed",
          error.issues,
        );
      }
      update = { food: parentUpdate.food };
    } else {
      this.authorizer.assertPermission(actor, PERMISSIONS.CHILDREN_UPDATE);
      if (
        actor.roles.some((role) => ![ROLES.ADMIN, ROLES.MANAGER].includes(role))
      ) {
        throw new AppError(
          403,
          "FIELD_UPDATE_FORBIDDEN",
          "Administrative child profile update is restricted",
        );
      }
      update = prepareChildProfileUpdate(input);
      if (Object.hasOwn(update, "benefitCode")) {
        this.authorizer.assertPermission(
          actor,
          PERMISSIONS.CHILDREN_BENEFIT_ASSIGN,
        );
      }
      if (update.guardians) await this.validateGuardians(update.guardians);
    }
    const scope = await this.accessPolicy.readScope(actor);
    const existing = await this.childRepository.findByIdInScope(childId, scope);
    if (!existing)
      throw new ResourceNotFoundError(NOT_FOUND, "Child not found");
    if (update.food) update.food = { ...existing.food, ...update.food };
    return this.unitOfWork.execute(async ({ session, recordAudit }) => {
      const updated = await this.childRepository.updateProfileByIdInScope(
        childId,
        update,
        scope,
        { session },
      );
      if (!updated)
        throw new ResourceNotFoundError(NOT_FOUND, "Child not found");
      await recordAudit({
        actorId: actor.id,
        requestId,
        action: "child.profile.update",
        entityType: "CHILD",
        entityId: childId,
        before: { profileUpdated: false },
        after: { profileUpdated: true },
        safeFields: ["profileUpdated"],
      });
      return this.viewPolicy.toReadDto(updated, actor);
    });
  }
}
