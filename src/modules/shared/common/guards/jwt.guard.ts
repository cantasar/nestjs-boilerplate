import { ExecutionContext, Injectable, type CanActivate } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

/**
 * Standalone passport-jwt guard for opt-in `@UseGuards(JwtGuard)` usage.
 * Prefer the global, fail-closed JwtAuthGuard for new code.
 */
export const JwtGuard = AuthGuard('jwt');

/**
 * Global, fail-closed authentication guard. Every route requires a valid JWT
 * unless the route or its controller is marked with `@Public()`.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') implements CanActivate {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  override canActivate(
    context: ExecutionContext,
  ): ReturnType<CanActivate['canActivate']> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;
    return super.canActivate(context);
  }
}
