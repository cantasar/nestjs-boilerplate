import {
  pgTable,
  serial,
  varchar,
  text,
  boolean,
  timestamp,
} from 'drizzle-orm/pg-core';
import { authProviderEnum } from '../../users/enums/auth-provider.enum';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  password: varchar('password', { length: 255 }),
  firstName: varchar('first_name', { length: 100 }),
  lastName: varchar('last_name', { length: 100 }),
  isActive: boolean('is_active').default(true).notNull(),
  refreshToken: text('refresh_token'),

  provider: authProviderEnum('provider'),
  providerId: varchar('provider_id', { length: 255 }),
  picture: text('picture'),
  emailVerified: boolean('email_verified').default(false).notNull(),

  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at')
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});
