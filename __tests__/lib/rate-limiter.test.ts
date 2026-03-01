import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { RateLimiter } from '@/lib/github/rate-limiter'

// Mock sleep to fast-forward time
const sleepMock = vi.fn()
vi.mock('@/lib/utils', () => ({
  sleep: (ms: number) => sleepMock(ms),
}))

describe('RateLimiter', () => {
  let limiter: RateLimiter

  beforeEach(() => {
    limiter = new RateLimiter({
      defaultDelayMs: 100,
      lowLimitThreshold: 10,
      lowLimitDelayMs: 500,
    })
    sleepMock.mockClear()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('initializes with default state', () => {
    const status = limiter.getStatus()
    expect(status.remaining).toBe(5000)
    expect(status.limit).toBe(5000)
  })

  it('updates state from headers', () => {
    limiter.updateFromHeaders({
      'x-ratelimit-remaining': '4000',
      'x-ratelimit-reset': '1700000000',
      'x-ratelimit-limit': '5000',
    })

    const status = limiter.getStatus()
    expect(status.remaining).toBe(4000)
    expect(status.limit).toBe(5000)
    expect(status.reset).toBe(1700000000 * 1000)
  })

  it('handles missing or invalid headers gracefully', () => {
    const initialStatus = limiter.getStatus()
    
    limiter.updateFromHeaders(undefined)
    expect(limiter.getStatus()).toEqual(initialStatus)

    limiter.updateFromHeaders({
      'x-ratelimit-remaining': 'invalid',
    })
    expect(limiter.getStatus()).toEqual(initialStatus)
  })

  it('waits default delay when remaining is high', async () => {
    limiter.updateFromHeaders({ 'x-ratelimit-remaining': '100' }) // > threshold 10
    await limiter.wait()
    expect(sleepMock).toHaveBeenCalledWith(100)
  })

  it('waits longer delay when remaining is low', async () => {
    limiter.updateFromHeaders({ 'x-ratelimit-remaining': '5' }) // < threshold 10
    await limiter.wait()
    expect(sleepMock).toHaveBeenCalledWith(500)
  })

  it('waits until reset when exhausted', async () => {
    const now = Date.now()
    const resetTime = now + 5000 // 5 seconds from now
    
    limiter.updateFromHeaders({
      'x-ratelimit-remaining': '0',
      'x-ratelimit-reset': String(Math.floor(resetTime / 1000)),
    })

    await limiter.wait()
    
    // resetTime (seconds precision) might slightly differ from ms precision
    // We expect waitMs to be roughly (resetTime - now) + 1000
    // roughly 6000ms
    const lastCallArg = sleepMock.mock.lastCall?.[0]
    expect(lastCallArg).toBeGreaterThan(4000)
    expect(lastCallArg).toBeLessThan(7000)
  })

  it('handles expired reset time when exhausted', async () => {
    const past = Date.now() - 5000 // 5 seconds ago
    
    limiter.updateFromHeaders({
      'x-ratelimit-remaining': '0',
      'x-ratelimit-reset': String(Math.floor(past / 1000)),
    })

    await limiter.wait()
    // Should proceed with default delay since reset time passed
    expect(sleepMock).toHaveBeenCalledWith(100)
  })
})
