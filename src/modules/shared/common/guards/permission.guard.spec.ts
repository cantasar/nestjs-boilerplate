import type { ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { PermissionGuard } from './permission.guard';
import { Permission } from '../enums/permission.enum';
import { UserRole } from '../enums/user-role.enum';

function makeReflector(required: Permission[] | undefined): Reflector {
  return {
    getAllAndOverride: () => required,
  } as unknown as Reflector;
}

function makeCtx(user: { role?: UserRole } | undefined): ExecutionContext {
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

describe('PermissionGuard', () => {
  it('allows when no permissions are required', () => {
    const guard = new PermissionGuard(makeReflector(undefined));
    expect(guard.canActivate(makeCtx({ role: UserRole.USER }))).toBe(true);
  });

  it('allows an admin holding the required permission', () => {
    const guard = new PermissionGuard(makeReflector([Permission.MANAGE_USERS]));
    expect(guard.canActivate(makeCtx({ role: UserRole.ADMIN }))).toBe(true);
  });

  it('denies a user lacking the required permission', () => {
    const guard = new PermissionGuard(makeReflector([Permission.MANAGE_USERS]));
    expect(() => guard.canActivate(makeCtx({ role: UserRole.USER }))).toThrow();
  });

  it('denies when there is no authenticated user', () => {
    const guard = new PermissionGuard(makeReflector([Permission.MANAGE_USERS]));
    expect(() => guard.canActivate(makeCtx(undefined))).toThrow();
  });
});
