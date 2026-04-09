import { pgEnum } from 'drizzle-orm/pg-core';

export enum AuthProvider {
  GOOGLE = 'google',
  APPLE = 'apple',
}

export const authProviderEnum = pgEnum(
  'auth_provider',
  Object.values(AuthProvider) as [AuthProvider, ...AuthProvider[]],
);
