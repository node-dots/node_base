import { AppError } from "../../../utils/errors.js";

export function makeAuthorizer({ roles, permissions, rolePermissions }) {
  const knownRoles = new Set(Object.values(roles));
  const knownPermissions = new Set(Object.values(permissions));
  if (knownRoles.size !== Object.keys(roles).length) {
    throw new Error("Коди ролей мають бути унікальними");
  }
  if (knownPermissions.size !== Object.keys(permissions).length) {
    throw new Error("Коди дозволів мають бути унікальними");
  }
  for (const role of knownRoles) {
    if (!Object.hasOwn(rolePermissions, role)) {
      throw new Error(`Відсутні налаштування ролі: ${role}`);
    }
  }
  for (const [role, grants] of Object.entries(rolePermissions)) {
    if (!knownRoles.has(role) || !Array.isArray(grants)) {
      throw new Error(`Некоректні налаштування ролі: ${role}`);
    }
    for (const permission of grants) assertKnown(permission);
    if (new Set(grants).size !== grants.length) {
      throw new Error(`Дозволи ролі ${role} дублюються`);
    }
  }

  function assertKnown(permission) {
    if (!knownPermissions.has(permission)) {
      throw new Error(`Невідомий дозвіл: ${String(permission)}`);
    }
  }

  function hasPermission(actor, permission) {
    assertKnown(permission);
    if (!actor?.id || !Array.isArray(actor.roles)) return false;
    if (actor.roles.some((role) => !knownRoles.has(role))) return false;
    return actor.roles.some((role) =>
      rolePermissions[role].includes(permission),
    );
  }

  function assertPermission(actor, permission) {
    if (!hasPermission(actor, permission)) {
      throw new AppError(403, "FORBIDDEN", "Недостатньо прав для цієї дії");
    }
  }

  return Object.freeze({ assertKnown, hasPermission, assertPermission });
}
