import { describe, it, expect } from 'vitest'
import { buildContext } from '@/lib/rag/context-builder'
import type { SearchResult } from '@/types'

function makeResult(
  text: string,
  score: number,
  overrides: Partial<SearchResult['metadata']> = {},
): SearchResult {
  return {
    text,
    score,
    metadata: {
      type: 'repo_overview',
      repo: 'test-repo',
      ...overrides,
    },
  }
}

describe('buildContext', () => {
  it('returns empty string for empty results', () => {
    expect(buildContext([])).toBe('')
  })

  it('orders chunks by relevance score (highest first)', () => {
    const results = [
      makeResult('Low relevance text', 0.4),
      makeResult('High relevance text', 0.9),
      makeResult('Medium relevance text', 0.6),
    ]
    const context = buildContext(results)
    const highIdx = context.indexOf('High relevance')
    const medIdx = context.indexOf('Medium relevance')
    const lowIdx = context.indexOf('Low relevance')
    expect(highIdx).toBeLessThan(medIdx)
    expect(medIdx).toBeLessThan(lowIdx)
  })

  it('includes source markers for each chunk', () => {
    const results = [makeResult('Some text about Python', 0.8, { type: 'repo_overview', repo: 'my-app' })]
    const context = buildContext(results)
    expect(context).toContain('[Source:')
    expect(context).toContain('my-app')
  })

  it('deduplicates overlapping chunks', () => {
    const sharedText =
      'This project is a REST API built with FastAPI and PostgreSQL for production use.'
    const results = [
      makeResult(sharedText + ' Extra detail A.', 0.9),
      makeResult(sharedText + ' Extra detail B.', 0.7),
    ]
    const context = buildContext(results)
    // The first (higher score) occurrence should appear, second should be deduplicated
    const count = (context.match(/REST API built with FastAPI/g) ?? []).length
    expect(count).toBe(1)
  })

  it('truncates total context at ~2000 token budget', () => {
    // Create many large chunks
    const results = Array.from({ length: 20 }, (_, i) =>
      makeResult('a'.repeat(400) + ` chunk-${i}`, 0.8 - i * 0.01),
    )
    const context = buildContext(results)
    // 2000 tokens ≈ 8000 chars — context should not greatly exceed this
    expect(context.length).toBeLessThan(12000)
  })

  it('formats source markers with repo and type', () => {
    const results = [
      makeResult('Commit message about auth fix', 0.75, {
        type: 'commit',
        repo: 'auth-service',
        date: '2024-06-01T00:00:00Z',
      }),
    ]
    const context = buildContext(results)
    expect(context).toContain('auth-service')
    expect(context).toContain('commit')
  })

  it('handles single result correctly', () => {
    const results = [makeResult('Only one chunk of content here', 0.85)]
    const context = buildContext(results)
    expect(context).toContain('Only one chunk')
    expect(context).toContain('[Source:')
  })
})
