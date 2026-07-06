/**
 * Claims carried by every token this service signs. `tokenType` discriminates
 * access from refresh tokens (both are signed with the same secret), so a
 * refresh token can never be replayed as a Bearer access token and vice versa.
 */
export interface JwtPayload {
  sub: number;
  email: string | null;
  tokenType: 'access' | 'refresh';
}
