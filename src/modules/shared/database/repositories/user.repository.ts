import {
  Inject,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { and, eq, sql, type AnyColumn } from 'drizzle-orm';
import { DATABASE_TOKENS } from '../database.tokens';
import type { DrizzleDB } from '../database.types';
import { users } from '../schema/user.schema';
import type { User } from '../types/user-select.type';
import type { NewUser } from '../types/user-insert.type';
import { UpsertOAuthUser } from '../types';

@Injectable()
export class UserRepository {
  constructor(
    @Inject(DATABASE_TOKENS.DRIZZLE) private readonly db: DrizzleDB,
  ) {}

  async findByEmail(email: string): Promise<User | undefined> {
    const [row] = await this.db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);
    return row;
  }

  async findById(id: number): Promise<User | undefined> {
    const [row] = await this.db
      .select()
      .from(users)
      .where(eq(users.id, id))
      .limit(1);
    return row;
  }

  async markEmailVerified(id: number): Promise<void> {
    await this.db
      .update(users)
      .set({ emailVerified: true })
      .where(eq(users.id, id));
  }

  async updatePasswordById(id: number, passwordHash: string): Promise<void> {
    await this.db
      .update(users)
      .set({ password: passwordHash })
      .where(eq(users.id, id));
  }

  async create(data: NewUser): Promise<User | undefined> {
    const [row] = await this.db.insert(users).values(data).returning();
    return row;
  }

  async upsertOAuthUser(data: UpsertOAuthUser): Promise<User> {
    // An unverified row may hold a password set by someone else, so it goes. One statement, so no race.
    const keepIfVerified = (column: AnyColumn) =>
      sql`case when ${users.emailVerified} then ${column} else null end`;
    // A matching email links the existing account to this provider.
    // Names and picture update only if sent; Apple sends names only on the first sign-in.
    const [user] = await this.db
      .insert(users)
      .values(data)
      .onConflictDoUpdate({
        target: users.email,
        set: {
          provider: data.provider,
          providerId: data.providerId,
          emailVerified: true,
          password: keepIfVerified(users.password),
          refreshToken: keepIfVerified(users.refreshToken),
          ...(data.picture && { picture: data.picture }),
          ...(data.firstName && { firstName: data.firstName }),
          ...(data.lastName && { lastName: data.lastName }),
        },
      })
      .returning();
    if (!user) throw new InternalServerErrorException('Failed to create user');
    return user;
  }

  /** Swaps the stored refresh token hash only if it still matches, so one token never rotates twice. */
  async rotateRefreshToken(
    id: number,
    currentHash: string,
    nextHash: string,
  ): Promise<boolean> {
    const rows = await this.db
      .update(users)
      .set({ refreshToken: nextHash })
      .where(and(eq(users.id, id), eq(users.refreshToken, currentHash)))
      .returning({ id: users.id });
    return rows.length > 0;
  }

  async updateRefreshToken(
    id: number,
    refreshToken: string | null,
  ): Promise<void> {
    await this.db.update(users).set({ refreshToken }).where(eq(users.id, id));
  }

  async updatePassword(email: string, passwordHash: string): Promise<void> {
    await this.db
      .update(users)
      .set({ password: passwordHash })
      .where(eq(users.email, email));
  }
}
