import 'reflect-metadata';
import { Controller, type ExecutionContext } from '@nestjs/common';
import { APP_GUARD, Reflector } from '@nestjs/core';
import { ThrottlerGuard } from '@nestjs/throttler';
import { RolesGuard } from './roles.guard';
import { JwtAuthGuard } from './jwt.guard';
import { Roles } from '../decorators/roles.decorator';
import { Public } from '../decorators/public.decorator';
import { DomainException } from '../errors/domain.exception';
import { CommonErrorCode } from '../errors/enums/common-error-code.enum';
import { UserRole } from '../../database/schema/enums/user-role.enum';
import { AppModule } from '../../../../app.module';

@Roles(UserRole.ADMIN)
@Controller('admin-only')
class AdminController {
  list(): void {}

  @Roles(UserRole.USER, UserRole.ADMIN)
  overview(): void {}
}

@Controller('mixed')
class MixedController {
  open(): void {}

  @Roles(UserRole.ADMIN)
  adminAction(): void {}

  @Public()
  @Roles(UserRole.ADMIN)
  publicButAdmin(): void {}

  @Roles()
  emptyRoles(): void {}
}

function context(
  controller: object,
  handler: () => void,
  user?: { role?: unknown },
): ExecutionContext {
  return {
    getClass: () => controller,
    getHandler: () => handler,
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

function expectForbidden(run: () => unknown): void {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(DomainException);
    expect((error as DomainException).code).toBe(CommonErrorCode.FORBIDDEN);
    expect((error as DomainException).getStatus()).toBe(403);
    return;
  }
  throw new Error('Expected the guard to throw 403');
}

describe('RolesGuard', () => {
  const guard = new RolesGuard(new Reflector());
  const admin = { role: UserRole.ADMIN };
  const user = { role: UserRole.USER };

  it('lets routes without @Roles through', () => {
    expect(
      guard.canActivate(
        context(MixedController, MixedController.prototype.open, user),
      ),
    ).toBe(true);
  });

  it('lets the right role through', () => {
    expect(
      guard.canActivate(
        context(MixedController, MixedController.prototype.adminAction, admin),
      ),
    ).toBe(true);
  });

  it('blocks the wrong role with COMMON_FORBIDDEN (403)', () => {
    expectForbidden(() =>
      guard.canActivate(
        context(MixedController, MixedController.prototype.adminAction, user),
      ),
    );
  });

  it('applies class-level @Roles to every handler', () => {
    expectForbidden(() =>
      guard.canActivate(
        context(AdminController, AdminController.prototype.list, user),
      ),
    );
    expect(
      guard.canActivate(
        context(AdminController, AdminController.prototype.list, admin),
      ),
    ).toBe(true);
  });

  it('lets a handler @Roles override the class @Roles', () => {
    expect(
      guard.canActivate(
        context(AdminController, AdminController.prototype.overview, user),
      ),
    ).toBe(true);
  });

  it('fails closed when there is no user (e.g. @Public route with @Roles)', () => {
    expectForbidden(() =>
      guard.canActivate(
        context(
          MixedController,
          MixedController.prototype.publicButAdmin,
          undefined,
        ),
      ),
    );
  });

  it('fails closed when the user has no role or an unknown role', () => {
    expectForbidden(() =>
      guard.canActivate(
        context(MixedController, MixedController.prototype.adminAction, {}),
      ),
    );
    expectForbidden(() =>
      guard.canActivate(
        context(MixedController, MixedController.prototype.adminAction, {
          role: 'ADMIN',
        }),
      ),
    );
  });

  it('treats an empty @Roles() as no restriction', () => {
    expect(
      guard.canActivate(
        context(MixedController, MixedController.prototype.emptyRoles, user),
      ),
    ).toBe(true);
  });
});

describe('global guard order in AppModule', () => {
  it('runs Throttler, then JWT, then Roles (roles need request.user)', () => {
    const providers = Reflect.getMetadata('providers', AppModule) as {
      provide?: unknown;
      useClass?: unknown;
    }[];
    const guards = providers
      .filter((provider) => provider.provide === APP_GUARD)
      .map((provider) => provider.useClass);

    expect(guards).toEqual([ThrottlerGuard, JwtAuthGuard, RolesGuard]);
  });
});
