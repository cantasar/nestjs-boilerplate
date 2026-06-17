import { notifications } from '../schema/notification.schema';

export type NewNotification = typeof notifications.$inferInsert;
