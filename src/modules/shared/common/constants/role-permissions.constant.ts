import { Permission } from '../enums/permission.enum';
import { UserRole } from '../enums/user-role.enum';

/**
 * Role → granted permissions. Single source of truth for `PermissionGuard`.
 * Placeholder grants: admin holds every permission, end users hold none. This
 * map is where finer grants live once roles diverge.
 */
export const ROLE_PERMISSIONS: Record<UserRole, readonly Permission[]> = {
  [UserRole.ADMIN]: Object.values(Permission),
  [UserRole.USER]: [],
};
