import type { JobsOptions } from 'bullmq';
import {
  DEFAULT_REMOVE_ON_COMPLETE,
  DEFAULT_REMOVE_ON_FAIL,
} from '../constants/queue.constants';
import type { QueueJobOptions } from '../interfaces/queue-job-options.interface';

/**
 * Builds BullMQ `JobsOptions` from a feature's partial overrides, applying the
 * shared retention caps and an exponential backoff default. Pure — no `this`.
 */
export function buildJobOptions(options: QueueJobOptions = {}): JobsOptions {
  const { attempts, backoffMs, delayMs } = options;
  return {
    ...(attempts !== undefined ? { attempts } : {}),
    ...(backoffMs !== undefined
      ? { backoff: { type: 'exponential', delay: backoffMs } }
      : {}),
    ...(delayMs !== undefined ? { delay: delayMs } : {}),
    removeOnComplete: { count: DEFAULT_REMOVE_ON_COMPLETE },
    removeOnFail: { count: DEFAULT_REMOVE_ON_FAIL },
  };
}
