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

/**
 * Bootstrap the very first login: creates a user from FIRST_ADMIN_EMAIL /
 * FIRST_ADMIN_PASSWORD on startup when both are set and the email doesn't
 * exist yet. Idempotent + multi-replica safe. Skips (with a debug log) when
 * the env vars are unset — local/dev setups without a seed stay untouched.
 *
 * NOTE: the boilerplate's `users` table carries no role column — wire your
 * app's role/permission assignment here once you add one (the RolesGuard /
 * PermissionGuard read `user.role` from the auth principal).
 */
@Injectable()
export class FirstAdminSeed implements OnApplicationBootstrap {
  private readonly logger = new Logger(FirstAdminSeed.name);

  constructor(
    @Inject(DATABASE_TOKENS.DRIZZLE) private readonly db: DrizzleDB,
    private readonly config: ConfigService,
  ) {}

  // void-ok: bootstrap hook — side-effecting seed, no result.
  async onApplicationBootstrap(): Promise<void> {
    // Normalize exactly like the login path (AuthService.normalizeEmail):
    // a mixed-case FIRST_ADMIN_EMAIL would otherwise be stored verbatim and
    // the lowercased login lookup would never find it — an admin that can
    // never sign in, with zero diagnostics.
    const email = this.config
      .get<string>('FIRST_ADMIN_EMAIL')
      ?.trim()
      .toLowerCase();
    const password = this.config.get<string>('FIRST_ADMIN_PASSWORD');

    if (!email || !password) {
      this.logger.debug(
        'FIRST_ADMIN_EMAIL / FIRST_ADMIN_PASSWORD unset — skipping first-admin seed',
      );
      return;
    }

    const [existing] = await this.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (existing) {
      this.logger.log('First admin already exists');
      return;
    }

    const passwordHash = await bcrypt.hash(password, 12);

    // onConflictDoNothing makes concurrent multi-replica boot safe: the
    // SELECT-then-INSERT above is not atomic, so two replicas can both pass
    // the existence check — without this the loser would crash on the email
    // unique constraint during startup.
    const inserted = await this.db
      .insert(users)
      .values({
        email,
        password: passwordHash,
        isActive: true,
        emailVerified: true,
      })
      .onConflictDoNothing({ target: users.email })
      .returning({ id: users.id });

    this.logger.log(
      inserted.length > 0
        ? 'First admin user created (NOTE: no role column exists yet — wire ' +
            'your role/permission assignment here or admin-guarded routes ' +
            'will 403 this account)'
        : 'First admin already exists (concurrent seed)',
    );
  }
}
