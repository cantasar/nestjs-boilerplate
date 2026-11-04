import { UnauthorizedException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { AuthService } from '../auth.service';
import type { UserRepository } from '../../../shared/database/repositories/user.repository';
import type { MailQueueService } from '../../mail/queue/mail-queue.service';
import type { RedisService } from '../../../shared/redis/redis.service';
import { AUTH_REDIS_KEYS } from '../auth.constants';
import { UserRole } from '../../../shared/database/schema/enums/user-role.enum';
import type { User } from '../../../shared/database/types/user-select.type';

// Real bcrypt and real JWTs: these tests check the stored-hash logic end to end, no mocks.
jest.setTimeout(30_000);

const EMAIL = 'rotation@example.com';
const PASSWORD = 'correct-password';
const NEW_PASSWORD = 'brand-new-password';

class InMemoryUsers {
  readonly rows = new Map<number, User>();

  async findByEmail(email: string): Promise<User | undefined> {
    return [...this.rows.values()].find((row) => row.email === email);
  }

  async findById(id: number): Promise<User | undefined> {
    return this.rows.get(id);
  }

  async updateRefreshToken(id: number, token: string | null): Promise<void> {
    const row = this.rows.get(id);
    if (row) row.refreshToken = token;
  }

  /** Same contract as the SQL: `UPDATE … WHERE id AND refresh_token = current`. */
  async rotateRefreshToken(
    id: number,
    current: string,
    next: string,
  ): Promise<boolean> {
    const row = this.rows.get(id);
    if (!row || row.refreshToken !== current) return false;
    row.refreshToken = next;
    return true;
  }

  async updatePassword(email: string, hash: string): Promise<void> {
    const row = await this.findByEmail(email);
    if (row) row.password = hash;
  }

  async updatePasswordById(id: number, hash: string): Promise<void> {
    const row = this.rows.get(id);
    if (row) row.password = hash;
  }

  async markEmailVerified(id: number): Promise<void> {
    const row = this.rows.get(id);
    if (row) row.emailVerified = true;
  }
}

describe('AuthService refresh token lifecycle (real bcrypt + JWT)', () => {
  let users: InMemoryUsers;
  let service: AuthService;
  let now: number;
  const redisStore = new Map<string, string>();

  const config: Record<string, string> = {
    JWT_SECRET: 'rotation-test-secret-0123456789abcdef',
    JWT_EXPIRATION: '15m',
    JWT_REFRESH_EXPIRATION: '7d',
  };
  const configService = {
    get: (key: string) => config[key],
    getOrThrow: (key: string) => {
      const value = config[key];
      if (value === undefined) throw new Error(`Unknown key: ${key}`);
      return value;
    },
  };
  const redisService = {
    get: async (key: string) => redisStore.get(key) ?? null,
    del: async (key: string) => (redisStore.delete(key) ? 1 : 0),
    incrWithTtlSeconds: async () => 1,
    setWithExpirySeconds: async (key: string, value: string) => {
      redisStore.set(key, value);
    },
  };

  /** JWT `iat` has 1-second steps, so move the clock between token issues. */
  const advanceClock = (seconds: number) => {
    now += seconds * 1000;
  };

  beforeEach(async () => {
    now = Date.parse('2026-11-02T10:00:00Z');
    jest.spyOn(Date, 'now').mockImplementation(() => now);
    redisStore.clear();
    users = new InMemoryUsers();
    users.rows.set(1, {
      id: 1,
      email: EMAIL,
      password: await bcrypt.hash(PASSWORD, 4),
      firstName: null,
      lastName: null,
      role: UserRole.USER,
      isActive: true,
      refreshToken: null,
      provider: null,
      providerId: null,
      picture: null,
      emailVerified: true,
      createdAt: new Date(now),
      updatedAt: new Date(now),
    });
    service = new AuthService(
      users as unknown as UserRepository,
      new JwtService({}),
      configService as unknown as ConfigService,
      redisService as unknown as RedisService,
      { enqueue: async () => undefined } as unknown as MailQueueService,
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('accepts the newest refresh token and returns a different one', async () => {
    const { refreshToken: first } = await service.login({
      email: EMAIL,
      password: PASSWORD,
    });
    advanceClock(5);

    const rotated = await service.refresh(first);

    expect(rotated.refreshToken).not.toBe(first);
    advanceClock(5);
    await expect(service.refresh(rotated.refreshToken)).resolves.toHaveProperty(
      'accessToken',
    );
  });

  it('never accepts an access token as a refresh token', async () => {
    const { accessToken } = await service.login({
      email: EMAIL,
      password: PASSWORD,
    });

    await expect(service.refresh(accessToken)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects a refresh token signed with another secret', async () => {
    await service.login({ email: EMAIL, password: PASSWORD });
    const forged = await new JwtService({}).signAsync(
      { sub: 1, email: EMAIL, tokenType: 'refresh' },
      { secret: 'attacker-secret', expiresIn: '7d' },
    );

    await expect(service.refresh(forged)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  // H1: the jti makes two refresh tokens differ even inside the same JWT second.
  it('gives two logins in the same second different refresh tokens, and only the newest works', async () => {
    const first = await service.login({ email: EMAIL, password: PASSWORD });
    const second = await service.login({ email: EMAIL, password: PASSWORD });

    expect(second.refreshToken).not.toBe(first.refreshToken);
    await expect(service.refresh(first.refreshToken)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    await expect(service.refresh(second.refreshToken)).resolves.toHaveProperty(
      'refreshToken',
    );
  });

  it('stores a SHA-256 hex digest, never the token itself', async () => {
    const { refreshToken } = await service.login({
      email: EMAIL,
      password: PASSWORD,
    });

    const stored = users.rows.get(1)?.refreshToken ?? '';
    expect(stored).toMatch(/^[0-9a-f]{64}$/);
    expect(stored).not.toBe(refreshToken);
    expect(refreshToken).not.toContain(stored);
  });

  // M3: a password change ends every other session, like a reset does.
  it('kills the refresh tokens from before a password change', async () => {
    const { refreshToken: stolen } = await service.login({
      email: EMAIL,
      password: PASSWORD,
    });

    await service.changePassword(1, PASSWORD, NEW_PASSWORD);

    await expect(service.refresh(stolen)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    await expect(
      service.login({ email: EMAIL, password: PASSWORD }),
    ).rejects.toThrow();
    await expect(
      service.login({ email: EMAIL, password: NEW_PASSWORD }),
    ).resolves.toHaveProperty('refreshToken');
  });

  // H1 (run 1): bcrypt reads only the first 72 bytes, and every refresh JWT of a
  // user has the same first 72 bytes (header + sub + email). So any old token matched the new hash.
  it('rejects the old refresh token after a rotation', async () => {
    const { refreshToken: first } = await service.login({
      email: EMAIL,
      password: PASSWORD,
    });
    advanceClock(5);
    const rotated = await service.refresh(first);
    expect(rotated.refreshToken).not.toBe(first);
    advanceClock(5);

    await expect(service.refresh(first)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  // L23: two refreshes with one token at the same time. Only the first swap may win.
  it('lets only one of two parallel refreshes with the same token win, and its token keeps working', async () => {
    const { refreshToken } = await service.login({
      email: EMAIL,
      password: PASSWORD,
    });
    advanceClock(5);

    const results = await Promise.allSettled([
      service.refresh(refreshToken),
      service.refresh(refreshToken),
    ]);

    const winners = results.filter((result) => result.status === 'fulfilled');
    expect(winners).toHaveLength(1);
    const loser = results.find((result) => result.status === 'rejected');
    expect(loser?.status === 'rejected' && loser.reason).toBeInstanceOf(
      UnauthorizedException,
    );
    const next = winners[0]?.status === 'fulfilled' && winners[0].value;
    advanceClock(5);
    await expect(
      service.refresh(next ? next.refreshToken : ''),
    ).resolves.toHaveProperty('accessToken');
  });

  it('keeps a logged-out refresh token dead after the next login', async () => {
    const { refreshToken: beforeLogout } = await service.login({
      email: EMAIL,
      password: PASSWORD,
    });
    await service.logout(1);
    await expect(service.refresh(beforeLogout)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );

    advanceClock(5);
    await service.login({ email: EMAIL, password: PASSWORD });
    advanceClock(5);

    await expect(service.refresh(beforeLogout)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('keeps a refresh token from before a password reset dead after the next login', async () => {
    const { refreshToken: stolen } = await service.login({
      email: EMAIL,
      password: PASSWORD,
    });
    redisStore.set(AUTH_REDIS_KEYS.resetPassword(EMAIL), '123456');
    await service.resetPassword(EMAIL, '123456', NEW_PASSWORD);
    await expect(service.refresh(stolen)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );

    advanceClock(5);
    await service.login({ email: EMAIL, password: NEW_PASSWORD });
    advanceClock(5);

    await expect(service.refresh(stolen)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
