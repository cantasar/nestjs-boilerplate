import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { DRIZZLE, type DrizzleDB } from '../../database/database.module';
import { users } from '../../database/schema/user.schema';
import { eq } from 'drizzle-orm';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    configService: ConfigService,
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('JWT_SECRET'),
    });
  }

  async validate(payload: { sub: number; email: string }) {
    const [user] = await this.db.select().from(users).where(eq(users.id, payload.sub)).limit(1);

    if (user) {
      const { password, ...result } = user;
      void password;
      return result;
    }
    return null;
  }
}
