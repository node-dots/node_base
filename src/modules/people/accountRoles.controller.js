export class AccountRolesController {
  constructor({ accountRolesService }) {
    this.accountRolesService = accountRolesService;
  }

  assign = async (request, response, next) => {
    try {
      const result = await this.accountRolesService.assign(
        { personId: request.validatedParams.id, ...request.validatedBody },
        request.actor,
        request.requestId,
      );
      return response.json({ data: result });
    } catch (error) {
      return next(error);
    }
  };
}
