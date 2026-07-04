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

  async validate(payload: JwtPayload): Promise<Omit<User, 'password'>> {
    // Access and refresh tokens share a signing secret; only a token minted
    // with the 'access' claim may authenticate a request.
    if (payload.tokenType !== 'access')
      throw new UnauthorizedException('Invalid token type');
    // Per-request DB lookup is a deliberate template default: it enforces
    // deactivation immediately (correctness first). Projects with tighter
    // latency budgets may swap in a short-TTL cache.
    const user = await this.userRepository.findById(payload.sub);
    if (!user) throw new UnauthorizedException('User not found');
    if (!user.isActive) throw new UnauthorizedException('User is not active');
    const { password, ...result } = user;
    void password;
    return result;
  }
}
