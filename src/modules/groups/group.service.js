import { BusinessError, ResourceNotFoundError } from "../../utils/errors.js";
import {
  GROUP_STATUS,
  GROUP_ERROR_CODES,
  GROUP_LIMITS,
} from "./group.constants.js";

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
  constructor({ groupRepository }) {
    this.groupRepository = groupRepository;
  }

  async createGroup(input) {
    return this.groupRepository.insert(buildGroupDraft(input));
  }

  async listGroups({ page, pageSize }) {
    const { groups, total } = await this.groupRepository.findAll({
      page,
      pageSize,
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

  async getGroup(groupId) {
    const group = await this.groupRepository.findById(groupId);
    if (!group)
      throw new ResourceNotFoundError(
        GROUP_ERROR_CODES.NOT_FOUND,
        "Групу не знайдено",
      );
    return group;
  }

  async getAgeSummary() {
    return this.groupRepository.summarizeByAge();
  }
}
