import { ROLES } from "../../../utils/access/roles.js";
import { PERMISSIONS } from "../../../utils/access/permissions.js";
import { rolePermissions } from "./rolePermissions.js";
import { makeAuthorizer } from "./makeAuthorizer.js";

export const authorizer = makeAuthorizer({
  roles: ROLES,
  permissions: PERMISSIONS,
  rolePermissions,
});
