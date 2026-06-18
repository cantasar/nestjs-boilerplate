import { notifications } from '../schema/notification.schema';

export type Notification = typeof notifications.$inferSelect;
