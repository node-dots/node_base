import { BusinessError, ResourceNotFoundError } from "../../utils/errors.js";
import {
  GROUP_STATUS,
  GROUP_ERROR_CODES,
  GROUP_LIMITS,
} from "./group.constants.js";
import { PERMISSIONS } from "../../utils/access/permissions.js";
import { AppError } from "../../utils/errors.js";
import {
  CATALOG_KIND,
  ROOM_TYPE,
  POSITION_CODE,
} from "../catalog/catalog.constants.js";

// Чисті правила можна викликати з service або seed без HTTP та MongoDB.
export function buildGroupDraft({ name, ageCategory, capacity }) {
  const normalizedName = typeof name === "string" ? name.trim() : "";
  if (
    normalizedName.length < GROUP_LIMITS.MIN_NAME_LENGTH ||
    normalizedName.length > GROUP_LIMITS.MAX_NAME_LENGTH
  ) {
    throw new BusinessError(
      GROUP_ERROR_CODES.INVALID_NAME,
      "Назва групи має містити від 1 до 100 символів",
    );
  }
  if (
    !Number.isInteger(ageCategory) ||
    ageCategory < GROUP_LIMITS.MIN_AGE_CATEGORY ||
    ageCategory > GROUP_LIMITS.MAX_AGE_CATEGORY
  ) {
    throw new BusinessError(
      GROUP_ERROR_CODES.INVALID_AGE_CATEGORY,
      "Вікова категорія має бути цілим числом від 2 до 5",
    );
  }
  if (
    !Number.isInteger(capacity) ||
    capacity < GROUP_LIMITS.MIN_CAPACITY ||
    capacity > GROUP_LIMITS.MAX_CAPACITY
  ) {
    throw new BusinessError(
      GROUP_ERROR_CODES.INVALID_CAPACITY,
      "У групі може бути від 1 до 20 місць",
    );
  }
  return {
    name: normalizedName,
    ageCategory,
    capacity,
    status: GROUP_STATUS.DRAFT,
  };
}

// DI: service отримує репозиторій і не імпортує модель Mongoose.
export class GroupService {
  constructor({
    groupRepository,
    authorizer,
    groupAccessPolicy,
    catalogRepository,
    personRepository,
    childRepository,
    unitOfWork,
  }) {
    this.groupRepository = groupRepository;
    this.authorizer = authorizer;
    this.groupAccessPolicy = groupAccessPolicy;
    Object.assign(this, {
      catalogRepository,
      personRepository,
      childRepository,
      unitOfWork,
    });
    this.authorizer.assertKnown(PERMISSIONS.GROUPS_READ);
    this.authorizer.assertKnown(PERMISSIONS.GROUPS_CREATE);
    this.authorizer.assertKnown(PERMISSIONS.GROUPS_UPDATE);
  }

  async createGroup(input, actor) {
    this.authorizer.assertPermission(actor, PERMISSIONS.GROUPS_CREATE);
    return this.groupRepository.insert(buildGroupDraft(input));
  }

  async listGroups({ page, pageSize }, actor) {
    this.authorizer.assertPermission(actor, PERMISSIONS.GROUPS_READ);
    const scope = await this.groupAccessPolicy.readScope(actor);
    const { groups, total } = await this.groupRepository.findAll({
      page,
      pageSize,
      scope,
    });

    return {
      groups,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  async getGroup(groupId, actor) {
    this.authorizer.assertPermission(actor, PERMISSIONS.GROUPS_READ);
    const scope = await this.groupAccessPolicy.readScope(actor);
    const group = await this.groupRepository.findById(groupId, { scope });
    if (!group)
      throw new ResourceNotFoundError(
        GROUP_ERROR_CODES.NOT_FOUND,
        "Групу не знайдено",
      );
    return group;
  }

  async getAgeSummary(actor) {
    this.authorizer.assertPermission(actor, PERMISSIONS.GROUPS_READ);
    const scope = await this.groupAccessPolicy.readScope(actor);
    return this.groupRepository.summarizeByAge({ scope });
  }

  assertMutationDependencies() {
    if (
      !this.unitOfWork ||
      !this.catalogRepository ||
      !this.personRepository ||
      !this.childRepository
    ) {
      throw new Error("Group resource management dependencies are required");
    }
  }

  async validateResources(resources) {
    const [schoolStart, schoolEnd] = resources.schoolYear
      .split("-")
      .map(Number);
    if (schoolEnd !== schoolStart + 1)
      throw new AppError(
        422,
        "INVALID_SCHOOL_YEAR",
        "School year must contain consecutive years",
      );
    if (resources.educatorId === resources.assistantId)
      throw new AppError(
        422,
        "GROUP_STAFF_MUST_DIFFER",
        "Educator and assistant must be different people",
      );
    const category = await this.catalogRepository.findById(
      resources.ageCategoryId,
    );
    const room = await this.catalogRepository.findById(resources.roomId);
    if (
      !category?.active ||
      category.kind !== CATALOG_KIND.AGE_CATEGORY ||
      !Number.isInteger(category.age)
    ) {
      throw new AppError(
        422,
        "INVALID_AGE_CATEGORY",
        "An active age category is required",
      );
    }
    if (
      !room?.active ||
      room.kind !== CATALOG_KIND.ROOM ||
      room.roomType !== ROOM_TYPE.GROUP
    ) {
      throw new AppError(
        422,
        "INVALID_GROUP_ROOM",
        "An active group room is required",
      );
    }
    if (resources.capacity > room.capacity)
      throw new AppError(
        422,
        "ROOM_CAPACITY_EXCEEDED",
        "Group capacity exceeds room capacity",
      );
    for (const [personId, positionCode] of [
      [resources.educatorId, POSITION_CODE.EDUCATOR],
      [resources.assistantId, POSITION_CODE.ASSISTANT],
    ]) {
      const person = await this.personRepository.findById(personId);
      if (
        person?.status !== "ACTIVE" ||
        person.employee?.positionCode !== positionCode ||
        person.employee.status !== "ACTIVE"
      ) {
        throw new AppError(
          422,
          "INVALID_GROUP_EMPLOYEE",
          `An active ${positionCode} employee is required`,
        );
      }
    }
    return { category, room };
  }

  async updateResources(groupId, resources, actor, requestId) {
    this.authorizer.assertPermission(actor, PERMISSIONS.GROUPS_UPDATE);
    this.assertMutationDependencies();
    await this.catalogRepository.ensureEmployeeResourceGuard();
    return this.unitOfWork.execute(async ({ session, recordAudit }) => {
      await this.catalogRepository.incrementEmployeeResourceGuard({ session });
      const current = await this.groupRepository.findByIdForUpdate(groupId, {
        session,
      });
      if (!current)
        throw new ResourceNotFoundError(
          GROUP_ERROR_CODES.NOT_FOUND,
          "Group not found",
        );
      if (![GROUP_STATUS.DRAFT, GROUP_STATUS.ACTIVE].includes(current.status))
        throw new AppError(
          409,
          "INVALID_GROUP_STATE",
          "Group resources cannot change in this state",
        );
      const { category } = await this.validateResources(resources);
      const occupiedSeats = await this.childRepository.countOccupiedByGroup(
        groupId,
        { session },
      );
      if (resources.capacity < occupiedSeats)
        throw new AppError(
          409,
          "CAPACITY_BELOW_OCCUPANCY",
          "Capacity cannot be lower than occupied seats",
        );
      const conflicts = await this.groupRepository.findActiveResourceConflicts({
        ...resources,
        excludeGroupId: groupId,
        session,
      });
      if (conflicts.length)
        throw new AppError(
          409,
          "GROUP_RESOURCE_CONFLICT",
          "A room or employee is already reserved in this school year",
        );
      const after = await this.groupRepository.updateById(
        groupId,
        {
          ...resources,
          ageCategory: category.age,
          occupiedSeats,
          status:
            current.status === GROUP_STATUS.DRAFT
              ? GROUP_STATUS.ACTIVE
              : current.status,
        },
        { session },
      );
      const resourceFields = [
        "schoolYear",
        "ageCategoryId",
        "roomId",
        "educatorId",
        "assistantId",
        "capacity",
      ];
      await recordAudit({
        actorId: actor.id,
        requestId,
        action: "group.resources.update",
        entityType: "GROUP",
        entityId: groupId,
        before: Object.fromEntries(
          resourceFields.map((field) => [field, current[field] ?? null]),
        ),
        after: Object.fromEntries(
          resourceFields.map((field) => [field, after[field] ?? null]),
        ),
        safeFields: resourceFields,
      });
      return after;
    });
  }

  async updateCapacity(groupId, capacity, actor, requestId) {
    this.authorizer.assertPermission(actor, PERMISSIONS.GROUPS_UPDATE);
    this.assertMutationDependencies();
    await this.catalogRepository.ensureEmployeeResourceGuard();
    return this.unitOfWork.execute(async ({ session, recordAudit }) => {
      await this.catalogRepository.incrementEmployeeResourceGuard({ session });
      const current = await this.groupRepository.findByIdForUpdate(groupId, {
        session,
      });
      if (!current)
        throw new ResourceNotFoundError(
          GROUP_ERROR_CODES.NOT_FOUND,
          "Group not found",
        );
      const occupiedSeats = await this.childRepository.countOccupiedByGroup(
        groupId,
        { session },
      );
      if (capacity < occupiedSeats)
        throw new AppError(
          409,
          "CAPACITY_BELOW_OCCUPANCY",
          "Capacity cannot be lower than occupied seats",
        );
      if (current.roomId) {
        const room = await this.catalogRepository.findById(current.roomId);
        if (capacity > room.capacity)
          throw new AppError(
            422,
            "ROOM_CAPACITY_EXCEEDED",
            "Group capacity exceeds room capacity",
          );
      }
      const updated = await this.groupRepository.updateById(
        groupId,
        { capacity, occupiedSeats },
        { session },
      );
      await recordAudit({
        actorId: actor.id,
        requestId,
        action: "group.capacity.update",
        entityType: "GROUP",
        entityId: groupId,
        before: { capacity: current.capacity },
        after: { capacity },
        safeFields: ["capacity"],
      });
      return updated;
    });
  }

  async deactivate(groupId, actor, requestId) {
    this.authorizer.assertPermission(actor, PERMISSIONS.GROUPS_UPDATE);
    this.assertMutationDependencies();
    await this.catalogRepository.ensureEmployeeResourceGuard();
    return this.unitOfWork.execute(async ({ session, recordAudit }) => {
      await this.catalogRepository.incrementEmployeeResourceGuard({ session });
      const current = await this.groupRepository.findByIdForUpdate(groupId, {
        session,
      });
      if (!current)
        throw new ResourceNotFoundError(
          GROUP_ERROR_CODES.NOT_FOUND,
          "Group not found",
        );
      const occupiedSeats = await this.childRepository.countOccupiedByGroup(
        groupId,
        { session },
      );
      if (occupiedSeats)
        throw new AppError(
          409,
          "GROUP_NOT_EMPTY",
          "A group with enrolled children cannot be deactivated",
        );
      const updated = await this.groupRepository.updateById(
        groupId,
        { status: GROUP_STATUS.INACTIVE, occupiedSeats: 0 },
        { session },
      );
      await recordAudit({
        actorId: actor.id,
        requestId,
        action: "group.deactivate",
        entityType: "GROUP",
        entityId: groupId,
        before: { status: current.status },
        after: { status: updated.status },
        safeFields: ["status"],
      });
      return updated;
    });
  }

  async transferToNextSchoolYear(groupId, actor, requestId) {
    this.authorizer.assertPermission(actor, PERMISSIONS.GROUPS_UPDATE);
    this.assertMutationDependencies();
    await this.catalogRepository.ensureEmployeeResourceGuard();
    return this.unitOfWork.execute(async ({ session, recordAudit }) => {
      await this.catalogRepository.incrementEmployeeResourceGuard({ session });
      const current = await this.groupRepository.findByIdForUpdate(groupId, {
        session,
      });
      if (!current)
        throw new ResourceNotFoundError(
          GROUP_ERROR_CODES.NOT_FOUND,
          "Group not found",
        );
      if (!current.schoolYear || !current.ageCategoryId)
        throw new AppError(
          409,
          "GROUP_MIGRATION_REQUIRED",
          "Migrate the group contract before transferring it",
        );
      const occupiedSeats = await this.childRepository.countOccupiedByGroup(
        groupId,
        { session },
      );
      if (occupiedSeats)
        throw new AppError(
          409,
          "GROUP_NOT_EMPTY",
          "A group with enrolled children cannot be transferred",
        );
      const [start] = current.schoolYear.split("-").map(Number);
      const nextSchoolYear = `${start + 1}-${start + 2}`;
      const inactive = await this.groupRepository.updateById(
        groupId,
        { status: GROUP_STATUS.INACTIVE, occupiedSeats: 0 },
        { session },
      );
      const next = await this.groupRepository.insert(
        {
          name: current.name,
          ageCategory: current.ageCategory,
          ageCategoryId: current.ageCategoryId,
          schoolYear: nextSchoolYear,
          capacity: current.capacity,
          status: GROUP_STATUS.DRAFT,
          occupiedSeats: 0,
        },
        { session },
      );
      await recordAudit({
        actorId: actor.id,
        requestId,
        action: "group.school-year.transfer",
        entityType: "GROUP",
        entityId: groupId,
        before: { status: current.status },
        after: { status: inactive.status, nextGroupId: next.id },
        safeFields: ["status", "nextGroupId"],
      });
      return { previous: inactive, next };
    });
  }
}
