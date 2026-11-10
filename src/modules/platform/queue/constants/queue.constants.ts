/** Worker concurrency when `QUEUE_CONCURRENCY` is unset. */
export const DEFAULT_QUEUE_CONCURRENCY = 5;

/** Caps job history in Redis. More failed jobs are kept, for debugging. */
export const DEFAULT_REMOVE_ON_COMPLETE = 200;
export const DEFAULT_REMOVE_ON_FAIL = 500;

/** All queue names live here so they never collide. */
export const QUEUE_NAMES = {
  MAIL: 'mail-send',
  WEBHOOK_DELIVERY: 'webhook-delivery',
} as const;
