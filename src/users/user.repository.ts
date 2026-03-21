import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DATABASE_TOKENS } from '../database/database.tokens';
import type { DrizzleDB } from '../database/database.types';
import { users } from '../database/schema/user.schema';
import type { User } from '../database/types/user-select.type';
import type { NewUser } from '../database/types/user-insert.type';

/**
 * User persistence operations.
 */
@Injectable()
export class UserRepository {
  constructor(
    @Inject(DATABASE_TOKENS.DRIZZLE) private readonly db: DrizzleDB,
  ) {}

  /**
   * Finds user by email.
   * @param email - User email
   * @returns User or undefined
   */
  async findByEmail(email: string): Promise<User | undefined> {
    const [row] = await this.db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);
    return row;
  }

  /**
   * Finds user by id.
   * @param id - User id
   * @returns User or undefined
   */
  async findById(id: number): Promise<User | undefined> {
    const [row] = await this.db
      .select()
      .from(users)
      .where(eq(users.id, id))
      .limit(1);
    return row;
  }

  /**
   * Creates a new user.
   * @param data - User insert data
   * @returns Created user or undefined
   */
  async create(data: NewUser): Promise<User | undefined> {
    const [row] = await this.db.insert(users).values(data).returning();
    return row;
  }

  /**
   * Updates refresh token for user.
   * @param id - User id
   * @param refreshToken - Hashed refresh token or null
   */
  async updateRefreshToken(
    id: number,
    refreshToken: string | null,
  ): Promise<void> {
    await this.db.update(users).set({ refreshToken }).where(eq(users.id, id));
  }

  /**
   * Updates password for user by email.
   * @param email - User email
   * @param passwordHash - Hashed password
   */
  async updatePassword(email: string, passwordHash: string): Promise<void> {
    await this.db
      .update(users)
      .set({ password: passwordHash })
      .where(eq(users.email, email));
  }
}
