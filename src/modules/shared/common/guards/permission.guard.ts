import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from '../decorators/require-permission.decorator';
import { Permission } from '../enums/permission.enum';
import { UserRole } from '../enums/user-role.enum';
import { ROLE_PERMISSIONS } from '../constants/role-permissions.constant';
import { DomainException } from '../errors/domain.exception';
import { CommonErrorCode } from '../errors/error-codes';

/**
 * Enforces `@RequirePermission(...)`. Assumes a preceding auth guard has
 * populated `request.user`. Routes with no `@RequirePermission` pass through.
 */
@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Permission[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required || required.length === 0) {
      return true;
    }

    const { user } = context
      .switchToHttp()
      .getRequest<{ user?: { role?: UserRole } }>();
    if (!user?.role) {
      throw new DomainException(CommonErrorCode.FORBIDDEN_MISSING_PERMISSION);
    }

    const granted = ROLE_PERMISSIONS[user.role] ?? [];
    const hasAll = required.every((p) => granted.includes(p));
    if (!hasAll) {
      throw new DomainException(CommonErrorCode.FORBIDDEN_MISSING_PERMISSION);
    }
    return true;
  }
}
