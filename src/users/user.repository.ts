import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DRIZZLE, type DrizzleDB } from '../database/database.module';
import { users, type NewUser } from '../database/schema/user.schema';

@Injectable()
export class UserRepository {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  async findByEmail(email: string) {
    const [row] = await this.db.select().from(users).where(eq(users.email, email)).limit(1);
    return row;
  }

  async findById(id: number) {
    const [row] = await this.db.select().from(users).where(eq(users.id, id)).limit(1);
    return row;
  }

  async create(data: NewUser) {
    const [row] = await this.db.insert(users).values(data).returning();
    return row;
  }

  async updateRefreshToken(id: number, refreshToken: string | null) {
    await this.db.update(users).set({ refreshToken }).where(eq(users.id, id));
  }

  async updatePassword(email: string, passwordHash: string) {
    await this.db.update(users).set({ password: passwordHash }).where(eq(users.email, email));
  }
}
