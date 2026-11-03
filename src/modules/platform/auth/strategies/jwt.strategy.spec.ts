import { UnauthorizedException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { JwtStrategy } from './jwt.strategy';
import type { UserRepository } from '../../../shared/database/repositories/user.repository';
import { UserRole } from '../../../shared/database/schema/enums/user-role.enum';
import type { User } from '../../../shared/database/types/user-select.type';

function buildUser(overrides: Partial<User> = {}): User {
  return {
    id: 1,
    email: 'user@example.com',
    password: 'password-hash',
    firstName: null,
    lastName: null,
    role: UserRole.ADMIN,
    isActive: true,
    refreshToken: 'refresh-token-hash',
    provider: null,
    providerId: null,
    picture: null,
    emailVerified: true,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

describe('JwtStrategy', () => {
  const findById = jest.fn();
  const configService = {
    getOrThrow: jest.fn(() => 'strategy-test-secret'),
  } as unknown as ConfigService;
  const strategy = new JwtStrategy(configService, {
    findById,
  } as unknown as UserRepository);

  beforeEach(() => {
    findById.mockReset();
  });

  it('rejects a refresh token used as a bearer token', async () => {
    await expect(
      strategy.validate({ sub: 1, email: null, tokenType: 'refresh' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(findById).not.toHaveBeenCalled();
  });

  it('rejects a token for a deleted user', async () => {
    findById.mockResolvedValue(undefined);

    await expect(
      strategy.validate({ sub: 1, email: null, tokenType: 'access' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects a deactivated user at once (DB check per request)', async () => {
    findById.mockResolvedValue(buildUser({ isActive: false }));

    await expect(
      strategy.validate({ sub: 1, email: null, tokenType: 'access' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('puts the DB role on request.user and strips both hashes', async () => {
    findById.mockResolvedValue(buildUser());

    const user = await strategy.validate({
      sub: 1,
      email: 'user@example.com',
      tokenType: 'access',
    });

    expect(user.role).toBe(UserRole.ADMIN);
    expect(user).not.toHaveProperty('password');
    expect(user).not.toHaveProperty('refreshToken');
  });

  it('reads the role from the DB, not from the token', async () => {
    findById.mockResolvedValue(buildUser({ role: UserRole.USER }));
    const forgedClaims = {
      sub: 1,
      email: 'user@example.com',
      tokenType: 'access' as const,
      role: UserRole.ADMIN,
    };

    const user = await strategy.validate(forgedClaims);

    expect(user.role).toBe(UserRole.USER);
  });
});
