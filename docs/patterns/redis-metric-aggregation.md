# High-frequency counters: Redis HINCRBY buffer → periodic Postgres flush

For hot-path events (views, clicks, impressions) a per-event DB INSERT melts
Postgres, and losing a few counts is acceptable — but unbounded loss is not.
This pattern buffers counts in a Redis hash and flushes them to a compact
daily-aggregate table once a minute, at-least-once.

## Shape

**Hot path** (request handler / event listener) — one pipelined round-trip:

```ts
// field encodes the aggregate key, e.g. `${metric}:${entityId}`
await this.redis.hincrbyMany(BUFFER_KEY, fields, 1);
```

**Flusher** (`@Cron(CronExpression.EVERY_MINUTE)`) — single-flier via lock,
crash-safe via atomic buffer swap:

```ts
const token = await this.redis.acquireLock(LOCK_KEY, LOCK_TTL_SECONDS);
if (!token) return; // another replica is flushing

try {
  // 1. Atomic swap: move the live buffer aside so hot-path writes continue
  //    into a fresh buffer while we drain the snapshot. RedisService.tryRename
  //    returns false only when the buffer is empty (missing key).
  //    IMPORTANT: drain any leftover snapshot FIRST (crash recovery — a
  //    previous flusher may have died after the rename, before the DB write).
  await this.drainSnapshot(); // if DRAIN_KEY exists from a crashed run
  if (!(await this.redis.tryRename(BUFFER_KEY, DRAIN_KEY))) return;
  await this.drainSnapshot();
} finally {
  await this.redis.releaseLock(LOCK_KEY, token); // fenced release
}

private async drainSnapshot(): Promise<void> {
  const counts = await this.redis.hgetall(DRAIN_KEY);
  if (Object.keys(counts).length === 0) return;
  // Upsert into a (day, metric, entityId) UNIQUE-keyed aggregate table:
  //   INSERT ... ON CONFLICT (day, metric, entity_id)
  //   DO UPDATE SET count = table.count + EXCLUDED.count
  await this.repo.incrementDailyAggregates(parse(counts));
  await this.redis.del(DRAIN_KEY); // delete ONLY after the DB write commits
}
```

**Storage**: a compact daily table — growth bounded by
`#entities × #metrics × #days`, not by event volume:

```sql
CREATE TABLE metric_daily (
  day date NOT NULL,
  metric varchar(32) NOT NULL,
  entity_id varchar(64) NOT NULL,
  count integer NOT NULL,
  UNIQUE (day, metric, entity_id)
);
```

## Semantics + gotchas

- **At-least-once**: a crash between the DB upsert and `DEL DRAIN_KEY`
  re-applies the snapshot on the next run → counts can be slightly HIGH, never
  silently lost. Acceptable for telemetry; do NOT use this pattern for billing.
- **Drain-first ordering** is what makes the crash window safe — always check
  for a leftover snapshot before renaming a new one over it (or use a unique
  drain key per run and scan for orphans).
- **Lock expiry, not early release, is the fence**: keep `LOCK_TTL` well above
  the worst-case flush time; the fenced `releaseLock` prevents deleting a lock
  someone else re-acquired.
- Rely on `RedisService.enforceNoEviction` (set on bootstrap) — an evicting
  Redis can drop the buffer under memory pressure.
- Reads that need "live-ish" totals can merge the DB aggregate with the
  current buffer hash; most dashboards just read the DB table.

Origin: cilt365 content-click + product-metric telemetry
(`ContentClicksService`, `ProductMetricsService` → `product_metric_daily`).
