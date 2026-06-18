import {
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { UserRole } from '../enums/user-role.enum';
import { DomainException } from '../errors/domain.exception';
import { CommonErrorCode } from '../errors/error-codes';

/**
 * JWT auth + admin-role gate in one guard. Authenticates via the `jwt` strategy,
 * then rejects any non-admin principal with `COMMON_FORBIDDEN_ADMIN_ONLY` (403).
 */
@Injectable()
export class ProdAdminGuard extends AuthGuard('jwt') {
  override canActivate(context: ExecutionContext) {
    return super.canActivate(context);
  }

  override handleRequest<
    TUser extends { role?: UserRole } = { role?: UserRole },
  >(
    err: unknown,
    user: TUser | false,
    _info: unknown,
    _context: ExecutionContext,
  ): TUser {
    if (err || !user) {
      throw err instanceof Error ? err : new UnauthorizedException();
    }
    if (user.role !== UserRole.ADMIN) {
      throw new DomainException(CommonErrorCode.FORBIDDEN_ADMIN_ONLY);
    }
    return user;
  }
}
