import { AuthProvider } from '../../users/enums/auth-provider.enum';

export interface UpsertOAuthUser {
  email: string;
  provider: AuthProvider;
  providerId: string;
  emailVerified: true;
  firstName?: string | null;
  lastName?: string | null;
  picture?: string | null;
}
