/**
 * The analysing screen should be readable, not a flash: at least ~2 seconds, and no artificial cap when
 * the server is slower. The result page only opens after both the server answer and this minimum.
 */
export const ANALYSING_MIN_MS = 2200;

export function analysingRemaining(startedAt: number, now: number = Date.now()): number {
  return Math.max(0, ANALYSING_MIN_MS - Math.max(0, now - startedAt));
}

export function waitForAnalysing(startedAt: number, now: number = Date.now()): Promise<void> {
  const remaining = analysingRemaining(startedAt, now);
  if (remaining <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, remaining));
}
