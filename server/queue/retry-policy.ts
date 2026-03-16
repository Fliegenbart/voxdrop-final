import type { BackoffStrategy } from 'bullmq';

const DEFAULT_RETRY_DELAYS_MS = [30_000, 120_000, 300_000];

export function getRetryDelayForAttempt(attemptsMade: number): number {
  const index = Math.max(0, attemptsMade - 1);
  if (index < DEFAULT_RETRY_DELAYS_MS.length) {
    return DEFAULT_RETRY_DELAYS_MS[index];
  }
  return DEFAULT_RETRY_DELAYS_MS[DEFAULT_RETRY_DELAYS_MS.length - 1];
}

export const tieredRetryBackoff: BackoffStrategy = (
  attemptsMade: number,
  type?: string,
) => {
  if (type !== 'tiered') {
    // Fallback to fixed retry delay for unknown types.
    return 30_000;
  }
  return getRetryDelayForAttempt(attemptsMade);
};

