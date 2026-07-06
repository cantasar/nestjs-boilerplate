# Per-user transactional serialization with `pg_advisory_xact_lock`

When multiple writers can replace "the current row" for a user (e.g. an
`is_latest` profile/state row written by both a user action AND a background
job), two races appear:

1. **Concurrent writers** — two transactions both flip old rows to
   `is_latest=false` and insert, leaving two "latest" rows (or none visible
   mid-flight).
2. **TOCTOU (read → long compute → write)** — a background job reads the
   current row, computes for seconds, then writes. A fresh user write landing
   in between gets silently flipped to history in favour of a result derived
   from STALE data.

## Pattern

Serialize per-user with a transaction-scoped advisory lock (auto-released on
commit/rollback — no unlock bookkeeping), and re-check your read under the
lock before writing:

```ts
async replaceLatestReturningId(
  userId: number,
  data: NewRow,
  expectedLatestId?: string, // the row id the caller's computation was based on
): Promise<string> {
  let rowId = '';
  await this.db.transaction(async (tx) => {
    // (CLASS_ID, userId) — pick one class id per lock domain to avoid
    // cross-feature collisions on the same user id.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${CLASS_ID}, ${userId})`);

    // TOCTOU guard: abort if someone replaced the base row since the caller
    // read it. The caller retries from fresh data or surfaces a typed error.
    if (expectedLatestId !== undefined) {
      const [current] = await tx
        .select({ id: rows.id })
        .from(rows)
        .where(and(eq(rows.userId, userId), eq(rows.isLatest, true)))
        .limit(1);
      if (current?.id !== expectedLatestId) throw Errors.superseded();
    }

    await tx
      .update(rows)
      .set({ isLatest: false })
      .where(and(eq(rows.userId, userId), eq(rows.isLatest, true)));
    const [inserted] = await tx.insert(rows).values(data).returning();
    if (!inserted) throw new Error('insert returned no row');
    rowId = inserted.id;
  });
  return rowId;
}
```

## Rules of thumb

- **xact lock, not session lock**: `pg_advisory_xact_lock` releases itself with
  the transaction; `pg_advisory_lock` leaks on a crashed holder.
- **Two-int form** `(classId, userId)`: namespaces lock domains; document the
  class ids in one constants file.
- The flip+insert MUST be in the same transaction as the lock — readers then
  see an atomic swap (never zero or two "latest" rows).
- The **caller** owns the retry: on `superseded`, re-read fresh state, recompute,
  try once more; if it loses again, fail loud (don't loop forever).
- For long computations, keep the compute OUTSIDE the lock (as above) — hold
  the lock only for check + swap. Locking around the whole compute serializes
  correctly too but stalls concurrent user writes for seconds.

Origin: cilt365 quiz profile persistence (`persistLatestProfile` /
`replaceLatestProfileReturningId`) — the TOCTOU re-check was added after an
AI-rebuild job clobbered a fresher quiz submission.
