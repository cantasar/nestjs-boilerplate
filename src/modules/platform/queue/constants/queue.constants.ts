/**
 * Default worker concurrency when QUEUE_CONCURRENCY is unset. A single worker
 * processes one job at a time; bump via env for IO-bound workloads.
 */
export const DEFAULT_QUEUE_CONCURRENCY = 5;

/**
 * Retained job history caps so completed/failed jobs do not grow unbounded in
 * Redis. Failures keep a deeper tail than successes for post-mortem.
 */
export const DEFAULT_REMOVE_ON_COMPLETE = 200;
export const DEFAULT_REMOVE_ON_FAIL = 500;

/**
 * Registry of queue names. Each consuming feature adds its queue name here so
 * names stay collision-free and discoverable in one place.
 */
export const QUEUE_NAMES = {
  EXAMPLE: 'example',
  MAIL: 'mail-send',
  SMS: 'sms-send',
  NOTIFICATION_BROADCAST: 'notification-broadcast',
  MEDIA_PROCESSING: 'media-processing',
} as const;
