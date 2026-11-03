import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { eq } from 'drizzle-orm';
import * as bcrypt from 'bcrypt';
import { DATABASE_TOKENS } from '../../shared/database/database.tokens';
import type { DrizzleDB } from '../../shared/database/database.types';
import { users } from '../../shared/database/schema';
import { UserRole } from '../../shared/database/schema/enums/user-role.enum';
import { AUTH_CONSTANTS } from '../auth/auth.constants';

/** Creates the first admin from FIRST_ADMIN_EMAIL / FIRST_ADMIN_PASSWORD on startup. Safe to run on every boot. */
@Injectable()
export class FirstAdminSeed implements OnApplicationBootstrap {
  private readonly logger = new Logger(FirstAdminSeed.name);

  constructor(
    @Inject(DATABASE_TOKENS.DRIZZLE) private readonly db: DrizzleDB,
    private readonly config: ConfigService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    // Lowercase like the login path, or the admin could never log in.
    const email = this.config
      .get<string>('FIRST_ADMIN_EMAIL')
      ?.trim()
      .toLowerCase();
    const password = this.config.get<string>('FIRST_ADMIN_PASSWORD');

    if (!email || !password) {
      this.logger.debug(
        'FIRST_ADMIN_EMAIL / FIRST_ADMIN_PASSWORD unset, skipping first-admin seed',
      );
      return;
    }

    const [existing] = await this.db
      .select({ role: users.role })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (existing) {
      // Never promote an existing account: someone else may have registered this email first.
      if (existing.role === UserRole.ADMIN) {
        this.logger.log('First admin already exists');
      } else {
        this.logger.warn(
          'FIRST_ADMIN_EMAIL belongs to a normal user. Nothing was changed.',
        );
      }
      return;
    }

    const passwordHash = await bcrypt.hash(
      password,
      AUTH_CONSTANTS.BCRYPT_SALT_ROUNDS,
    );

    // onConflictDoNothing keeps two replicas booting at once from crashing.
    const inserted = await this.db
      .insert(users)
      .values({
        email,
        password: passwordHash,
        role: UserRole.ADMIN,
        isActive: true,
        emailVerified: true,
      })
      .onConflictDoNothing({ target: users.email })
      .returning({ id: users.id });

    this.logger.log(
      inserted.length > 0
        ? 'First admin user created'
        : 'First admin already exists (concurrent seed)',
    );
  }
}
