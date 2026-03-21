import { AuthGuard } from '@nestjs/passport';

export const JwtGuard = AuthGuard('jwt');
