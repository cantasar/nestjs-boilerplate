import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { UserRole } from '../enums/user-role.enum';
import { DomainException } from '../errors/domain.exception';
import { CommonErrorCode } from '../errors/error-codes';

/**
 * Enforces `@Roles(...)`. Assumes a preceding auth guard has populated
 * `request.user`. Routes with no `@Roles` metadata pass through.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }
    const { user } = context
      .switchToHttp()
      .getRequest<{ user?: { role?: UserRole } }>();
    if (user?.role && requiredRoles.includes(user.role)) {
      return true;
    }
    throw new DomainException(CommonErrorCode.FORBIDDEN);
  }
}
