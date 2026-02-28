import { sleep } from '@/lib/utils'

interface RateLimitState {
  remaining: number
  reset: number
  limit: number
}

/**
 * Simple rate limiter that respects GitHub's rate limit headers.
 * Adds configurable delay between requests and pauses when near the limit.
 */
export class RateLimiter {
  private state: RateLimitState = {
    remaining: 5000,
    reset: Date.now() + 3600000,
    limit: 5000,
  }
  private readonly defaultDelayMs: number
  private readonly lowLimitThreshold: number
  private readonly lowLimitDelayMs: number

  constructor(options?: {
    defaultDelayMs?: number
    lowLimitThreshold?: number
    lowLimitDelayMs?: number
  }) {
    this.defaultDelayMs = options?.defaultDelayMs ?? 100
    this.lowLimitThreshold = options?.lowLimitThreshold ?? 100
    this.lowLimitDelayMs = options?.lowLimitDelayMs ?? 2000
  }

  /**
   * Update rate limit state from response headers.
   */
  updateFromHeaders(headers: Record<string, string | number | undefined>): void {
    const remaining = headers['x-ratelimit-remaining']
    const reset = headers['x-ratelimit-reset']
    const limit = headers['x-ratelimit-limit']

    if (remaining !== undefined) this.state.remaining = Number(remaining)
    if (reset !== undefined) this.state.reset = Number(reset) * 1000
    if (limit !== undefined) this.state.limit = Number(limit)

    if (this.state.remaining < this.lowLimitThreshold) {
      console.warn(
        `[RateLimiter] Low rate limit: ${this.state.remaining}/${this.state.limit} remaining. ` +
          `Resets at ${new Date(this.state.reset).toISOString()}`,
      )
    }
  }

  /**
   * Wait the appropriate delay before the next request.
   * Pauses longer when rate limit is low.
   */
  async wait(): Promise<void> {
    if (this.state.remaining <= 0) {
      const waitMs = Math.max(0, this.state.reset - Date.now()) + 1000
      console.warn(`[RateLimiter] Rate limit exhausted. Waiting ${waitMs}ms until reset.`)
      await sleep(waitMs)
      return
    }

    if (this.state.remaining < this.lowLimitThreshold) {
      await sleep(this.lowLimitDelayMs)
    } else {
      await sleep(this.defaultDelayMs)
    }
  }

  getStatus(): RateLimitState {
    return { ...this.state }
  }

  isExhausted(): boolean {
    return this.state.remaining <= 0 && Date.now() < this.state.reset
  }

  getResetTime(): Date {
    return new Date(this.state.reset)
  }
}
