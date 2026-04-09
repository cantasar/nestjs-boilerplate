import {
  Inject,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DATABASE_TOKENS } from '../database/database.tokens';
import type { DrizzleDB } from '../database/database.types';
import { users } from '../database/schema/user.schema';
import type { User } from '../database/types/user-select.type';
import type { NewUser } from '../database/types/user-insert.type';
import { UpsertOAuthUser } from '../database/types';

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

  async create(data: NewUser): Promise<User | undefined> {
    const [row] = await this.db.insert(users).values(data).returning();
    return row;
  }

  async upsertOAuthUser(data: UpsertOAuthUser): Promise<User> {
    // On email conflict, we update OAuth fields — this implicitly links an
    // existing password-based account to the OAuth provider. Names are only
    // updated when present (Apple only sends them on the very first sign-in).
    const [user] = await this.db
      .insert(users)
      .values(data)
      .onConflictDoUpdate({
        target: users.email,
        set: {
          provider: data.provider,
          providerId: data.providerId,
          picture: data.picture,
          emailVerified: true,
          ...(data.firstName && { firstName: data.firstName }),
          ...(data.lastName && { lastName: data.lastName }),
        },
      })
      .returning();

    if (!user) throw new InternalServerErrorException('Failed to create user');

    return user;
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
