import { PERMISSIONS } from '@pe/shared';
import type { Permission } from '@pe/shared';

export { PERMISSIONS };
export type { Permission };

export type PermissionUser = {
  role?: string | null;
  permissions?: string[] | null;
};

export function hasPermission(user: PermissionUser | null | undefined, permission: Permission) {
  return Boolean(user?.permissions?.includes(permission));
}

export function hasAnyPermission(user: PermissionUser | null | undefined, permissions: Permission[]) {
  return permissions.some((permission) => hasPermission(user, permission));
}
