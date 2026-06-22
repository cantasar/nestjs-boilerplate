import { SetMetadata } from '@nestjs/common';
import { Permission } from '../enums/permission.enum';

export const PERMISSIONS_KEY = 'permissions';

/**
 * Require ALL listed permissions on the handler/controller. Enforced by
 * `PermissionGuard` (use with a preceding auth guard so `request.user` is set).
 */
export const RequirePermission = (...permissions: Permission[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);
