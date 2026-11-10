import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { User } from '../../../shared/database/types/user-select.type';
import { UserRepository } from '../../../shared/database/repositories/user.repository';
import type { JwtPayload } from '../interfaces/jwt-payload.interface';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    configService: ConfigService,
    private readonly userRepository: UserRepository,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('JWT_SECRET'),
    });
  }

  async validate(
    payload: JwtPayload,
  ): Promise<Omit<User, 'password' | 'refreshToken'>> {
    // Only access tokens may authenticate a request.
    if (payload.tokenType !== 'access')
      throw new UnauthorizedException('Invalid token type');
    // A DB lookup per request makes deactivation work at once. Add a short cache if latency matters.
    const user = await this.userRepository.findById(payload.sub);
    if (!user) throw new UnauthorizedException('User not found');
    if (!user.isActive) throw new UnauthorizedException('User is not active');
    const { password, refreshToken, ...result } = user;
    void password;
    void refreshToken;
    return result;
  }
}
