/** Resolve after the given number of milliseconds. */
export function sleep(ms: number): Promise<void> {
  // void-ok
  return new Promise((resolve) => setTimeout(resolve, ms));
}
