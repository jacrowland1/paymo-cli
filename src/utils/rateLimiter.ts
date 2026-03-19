import { AxiosResponse } from "axios";

/** Minimum remaining requests before preemptive throttling kicks in */
const RATE_LIMIT_BUFFER = 2;

interface RateLimitState {
  /** Length in seconds of the current decay period */
  decayPeriod: number | null;
  /** Total requests allowed per decay period */
  limit: number | null;
  /** Remaining requests in the current decay period */
  remaining: number | null;
  /** Timestamp (ms) when the current decay period resets */
  resetsAt: number | null;
}

export class RateLimiter {
  private state: RateLimitState = {
    decayPeriod: null,
    limit: null,
    remaining: null,
    resetsAt: null,
  };

  /** Parse rate-limit headers from a response and update local state */
  updateFromResponse(response: AxiosResponse): void {
    const headers = response.headers;
    const decay = Number(headers["x-ratelimit-decay-period"]);
    const limit = Number(headers["x-ratelimit-limit"]);
    const remaining = Number(headers["x-ratelimit-remaining"]);

    if (!isNaN(decay) && decay > 0) this.state.decayPeriod = decay;
    if (!isNaN(limit) && limit > 0) this.state.limit = limit;
    if (!isNaN(remaining) && remaining >= 0) {
      this.state.remaining = remaining;
      if (this.state.decayPeriod) {
        this.state.resetsAt = Date.now() + this.state.decayPeriod * 1_000;
      }
    }
  }

  /**
   * Wait if we are near the rate limit.
   *
   * Call this before every request that is part of a bulk loop.
   * - If remaining > buffer → proceeds immediately (no delay).
   * - If remaining <= buffer → sleeps until the decay window resets,
   *   distributing the remaining budget evenly.
   */
  async waitIfNeeded(): Promise<void> {
    const { remaining, limit, resetsAt } = this.state;

    // No data yet — nothing to throttle
    if (remaining === null || resetsAt === null) return;

    // Reset window has passed — clear stale state
    if (Date.now() >= resetsAt) {
      this.state.remaining = this.state.limit;
      this.state.resetsAt = null;
      return;
    }

    // Still have comfortable headroom
    if (remaining > RATE_LIMIT_BUFFER) return;

    // Close to the limit — spread remaining calls over the time left
    const msLeft = resetsAt - Date.now();
    const callsLeft = Math.max(remaining, 1);
    const delay = Math.ceil(msLeft / callsLeft);

    console.warn(
      `  ⏳ Approaching rate limit (${remaining}/${limit} remaining, ` +
        `window resets in ${(msLeft / 1_000).toFixed(1)}s) — pausing ${(delay / 1_000).toFixed(1)}s`,
    );

    await RateLimiter.sleep(delay);
  }

  static sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
