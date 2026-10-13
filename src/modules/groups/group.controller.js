import { HTTP_STATUS } from '../../utils/httpConstants.js';
import { toGroupDto, toAgeSummaryDto } from './group.dto.js';

export class GroupController {
  constructor({ groupService }) {
    this.groupService = groupService;
  }

  async list(request, response) {
    const groups = await this.groupService.listGroups();
    response.json({ data: groups.map(toGroupDto), meta: { total: groups.length } });
  }

  async get(request, response) {
    const group = await this.groupService.getGroup(request.params.id);
    response.json({ data: toGroupDto(group) });
  }

  async create(request, response) {
    const group = await this.groupService.createGroup(request.validatedBody);
    response
      .location(`/api/v1/groups/${group.id}`)
      .status(HTTP_STATUS.CREATED)
      .json({ data: toGroupDto(group) });
  }

  async summary(request, response) {
    const summaries = await this.groupService.getAgeSummary();
    response.json({ data: summaries.map(toAgeSummaryDto) });
  }
}
