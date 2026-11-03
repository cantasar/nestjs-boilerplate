import { pgEnum } from 'drizzle-orm/pg-core';

/** User roles checked by `@Roles()`. Replace with your app's real roles. */
export enum UserRole {
  ADMIN = 'admin',
  USER = 'user',
}

export const userRoleEnum = pgEnum(
  'user_role',
  Object.values(UserRole) as [UserRole, ...UserRole[]],
);
