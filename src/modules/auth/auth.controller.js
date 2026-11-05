export class AuthController {
  constructor({ authService }) {
    this.authService = authService;
  }

  login = async (request, response, next) => {
    try {
      const result = await this.authService.login(request.body);
      return response.json({ data: result });
    } catch (error) {
      return next(error);
    }
  };

  currentActor = (request, response) => response.json({ data: request.actor });

  changePassword = async (request, response, next) => {
    try {
      await this.authService.changePassword(
        request.actor,
        request.body,
        request.requestId,
      );
      return response.json({ data: { status: "PASSWORD_CHANGED" } });
    } catch (error) {
      return next(error);
    }
  };

  logoutAll = async (request, response, next) => {
    try {
      await this.authService.logoutAll(request.actor, request.requestId);
      return response.json({ data: { status: "SESSIONS_REVOKED" } });
    } catch (error) {
      return next(error);
    }
  };
}
