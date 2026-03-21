import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { DATABASE_TOKENS } from '../../database/database.tokens';
import type { DrizzleDB } from '../../database/database.types';
import { users } from '../../database/schema/user.schema';
import { eq } from 'drizzle-orm';
import type { User } from '../../database/types/user-select.type';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    configService: ConfigService,
    @Inject(DATABASE_TOKENS.DRIZZLE) private readonly db: DrizzleDB,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('JWT_SECRET'),
    });
  }

  async validate(payload: {
    sub: number;
    email: string;
  }): Promise<Omit<User, 'password'> | null> {
    const [user] = await this.db
      .select()
      .from(users)
      .where(eq(users.id, payload.sub))
      .limit(1);
    if (!user) return null;
    const { password, ...result } = user;
    void password;
    return result;
  }
}
