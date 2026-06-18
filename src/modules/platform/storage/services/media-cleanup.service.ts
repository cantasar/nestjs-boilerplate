import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { RedisService } from '../../../shared/redis/redis.service';
import type { SweepResult } from '../interfaces/sweep-result.interface';
import {
  MEDIA_CLEANUP_OPTIONS,
  type MediaCleanupOptions,
} from '../interfaces/media-cleanup-options.interface';
import {
  MEDIA_REFERENCE_PROVIDERS,
  type MediaReferenceProvider,
} from '../interfaces/media-reference-provider.interface';
import {
  STORAGE_SERVICE,
  type StorageService,
} from '../interfaces/storage.types';

const LOCK_KEY = 'cron:media-cleanup:lock';
const LOCK_TTL_SECONDS = 30 * 60;
const FAILURE_ALERT_THRESHOLD = 0.1;

/**
 * Generic scheduled orphan sweeper. It scans the configured storage prefixes,
 * unions every {@link MediaReferenceProvider}'s "still-referenced" keys, and
 * deletes only unreferenced objects older than the prefix's grace window.
 *
 * Fully domain-agnostic: it knows nothing about which tables hold keys (that is
 * the providers' job) nor which prefixes exist (that is `MEDIA_CLEANUP_OPTIONS`).
 * With no prefixes configured the sweep is a safe no-op, so the job ships
 * dormant until an app opts in.
 *
 * A Redis fencing lock keeps a single replica running the sweep at a time.
 */
@Injectable()
export class MediaCleanupService {
  private readonly logger = new Logger(MediaCleanupService.name);

  constructor(
    @Inject(STORAGE_SERVICE) private readonly storage: StorageService,
    @Inject(MEDIA_CLEANUP_OPTIONS)
    private readonly options: MediaCleanupOptions,
    @Inject(MEDIA_REFERENCE_PROVIDERS)
    private readonly providers: MediaReferenceProvider[],
    private readonly redis: RedisService,
  ) {}

  @Cron(CronExpression.EVERY_WEEK)
  async sweepOrphans(): Promise<SweepResult> {
    if (this.options.prefixes.length === 0) {
      return this.emptyResult(false);
    }

    const lockToken = await this.redis.acquireLock(LOCK_KEY, LOCK_TTL_SECONDS);
    if (!lockToken) {
      this.logger.log('Media sweep skipped — another replica holds the lock');
      return this.emptyResult(false);
    }

    const start = Date.now();
    try {
      return await this.runSweep(start);
    } finally {
      // Fenced release: no-op if the sweep overran the TTL and the lock was
      // re-acquired by another replica.
      await this.redis.releaseLock(LOCK_KEY, lockToken);
    }
  }

  private async runSweep(start: number): Promise<SweepResult> {
    const referenced = await this.collectReferencedKeys();
    const now = Date.now();

    let scanned = 0;
    let deleted = 0;
    let failed = 0;
    let skippedNoTimestamp = 0;

    for (const spec of this.options.prefixes) {
      const list = await this.storage.listObjects(spec.prefix);
      scanned += list.length;
      const cutoff = now - spec.graceMs;

      const orphans = list.filter((o) => {
        if (referenced.has(o.name)) return false;
        if (Number.isNaN(o.timeCreated)) {
          skippedNoTimestamp++;
          return false;
        }
        return o.timeCreated < cutoff;
      });

      for (const orphan of orphans) {
        try {
          await this.storage.deleteObject(orphan.name);
          deleted++;
        } catch (err) {
          failed++;
          this.logger.warn(
            `Failed to delete orphan ${orphan.name}: ${this.toMessage(err)}`,
          );
        }
      }
    }

    if (
      scanned > 0 &&
      failed / Math.max(deleted + failed, 1) >= FAILURE_ALERT_THRESHOLD
    ) {
      this.logger.error(
        `Media sweep failure rate high: ${failed}/${deleted + failed} deletes failed`,
      );
    }
    if (skippedNoTimestamp > 0) {
      this.logger.warn(
        `Media sweep: ${skippedNoTimestamp} files skipped (missing timeCreated metadata)`,
      );
    }

    this.logger.log(
      `Media sweep: scanned ${scanned}, deleted ${deleted}, failed ${failed}, skipped ${skippedNoTimestamp}, took ${Date.now() - start}ms`,
    );
    return {
      acquired: true,
      scanned,
      deleted,
      failed,
      skippedNoTimestamp,
    };
  }

  private async collectReferencedKeys(): Promise<Set<string>> {
    const set = new Set<string>();
    for (const provider of this.providers) {
      const keys = await provider.collectReferencedKeys();
      for (const key of keys) set.add(key);
    }
    return set;
  }

  private emptyResult(acquired: boolean): SweepResult {
    return {
      acquired,
      scanned: 0,
      deleted: 0,
      failed: 0,
      skippedNoTimestamp: 0,
    };
  }

  private toMessage(err: unknown): string {
    return err instanceof Error ? err.message : String(err);
  }
}
