export function createRequirePermission({ authorizer, permission }) {
  authorizer.assertKnown(permission);
  return function requirePermission(request, response, next) {
    try {
      authorizer.assertPermission(request.actor, permission);
      return next();
    } catch (error) {
      return next(error);
    }
  };
}
