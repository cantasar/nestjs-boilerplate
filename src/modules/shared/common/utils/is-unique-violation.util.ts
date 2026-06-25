/** True when the error is a Postgres `unique_violation` (SQLSTATE 23505) from the `pg` driver. */
export function isUniqueViolation(err: unknown): boolean {
  // boundary: validated
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code?: string }).code === '23505'
  );
}
