/**
 * Subset of BullMQ job options a feature typically overrides per enqueue.
 * Helpers default the rest (retention caps, backoff) from queue constants.
 */
export interface QueueJobOptions {
  attempts?: number;
  backoffMs?: number;
  delayMs?: number;
}
