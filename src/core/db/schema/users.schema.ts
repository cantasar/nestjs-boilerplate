import { pgTable, serial, varchar, text, boolean, timestamp } from 'drizzle-orm/pg-core';
// import { relations } from 'drizzle-orm';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  password: varchar('password', { length: 255 }).notNull(),
  firstName: varchar('first_name', { length: 100 }),
  lastName: varchar('last_name', { length: 100 }),
  isActive: boolean('is_active').default(true).notNull(),
  refreshToken: text('refresh_token'),

  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at')
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

// Add relations here:
// export const usersRelations = relations(users, ({ one, many }) => ({
// 	preferences: one(userPreferences),
// 	courses: many(courses),
// }));

// Types
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
