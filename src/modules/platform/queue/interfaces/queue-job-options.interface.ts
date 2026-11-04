/** Per-job overrides; `buildJobOptions` fills in the shared defaults. */
export interface QueueJobOptions {
  attempts?: number;
  backoffMs?: number;
  delayMs?: number;
}
