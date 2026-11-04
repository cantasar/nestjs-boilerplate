/** Token claims. `tokenType` keeps refresh tokens from being used as access tokens and back. */
export interface JwtPayload {
  sub: number;
  email: string | null;
  tokenType: 'access' | 'refresh';
}
