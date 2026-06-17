/** Outcome of one media-cleanup sweep run, returned for logging/metrics. */
export interface SweepResult {
  acquired: boolean;
  scanned: number;
  deleted: number;
  failed: number;
  skippedNoTimestamp: number;
}
