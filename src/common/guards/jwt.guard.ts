import { AuthGuard } from '@nestjs/passport';

/** Requires valid JWT in `Authorization: Bearer` header. */
export const JwtGuard = AuthGuard('jwt');
