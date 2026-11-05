import { HTTP_STATUS } from "../../utils/httpConstants.js";
import { toGroupDto, toAgeSummaryDto } from "./group.dto.js";

export class GroupController {
  constructor({ groupService }) {
    this.groupService = groupService;
  }

  async list(request, response) {
    const { groups, pagination } = await this.groupService.listGroups(
      request.validatedQuery,
      request.actor,
    );

    response.json({
      data: groups.map(toGroupDto),
      meta: pagination,
    });
  }

  async get(request, response) {
    const group = await this.groupService.getGroup(
      request.params.id,
      request.actor,
    );
    response.json({ data: toGroupDto(group) });
  }

  async create(request, response) {
    const group = await this.groupService.createGroup(
      request.validatedBody,
      request.actor,
    );
    response
      .location(`/api/v1/groups/${group.id}`)
      .status(HTTP_STATUS.CREATED)
      .json({ data: toGroupDto(group) });
  }

  async summary(request, response) {
    const summaries = await this.groupService.getAgeSummary(request.actor);
    response.json({ data: summaries.map(toAgeSummaryDto) });
  }
}
