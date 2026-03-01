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
    const { contextText } = buildContext([])
    expect(contextText).toBe('')
  })

  it('orders chunks by relevance score (highest first)', () => {
    const results = [
      makeResult('Low relevance text', 0.4),
      makeResult('High relevance text', 0.9),
      makeResult('Medium relevance text', 0.6),
    ]
    const { contextText } = buildContext(results)
    const highIdx = contextText.indexOf('High relevance')
    const medIdx = contextText.indexOf('Medium relevance')
    const lowIdx = contextText.indexOf('Low relevance')
    expect(highIdx).toBeLessThan(medIdx)
    expect(medIdx).toBeLessThan(lowIdx)
  })

  it('includes source markers for each chunk', () => {
    const results = [makeResult('Some text about Python', 0.8, { type: 'repo_overview', repo: 'my-app' })]
    const { contextText } = buildContext(results)
    expect(contextText).toContain('[Source:')
    expect(contextText).toContain('my-app')
  })

  it('deduplicates overlapping chunks', () => {
    const sharedText =
      'This project is a REST API built with FastAPI and PostgreSQL for production use.'
    const results = [
      makeResult(sharedText + ' Extra detail A.', 0.9),
      makeResult(sharedText + ' Extra detail B.', 0.7),
    ]
    const { contextText } = buildContext(results)
    // The first (higher score) occurrence should appear, second should be deduplicated
    const count = (contextText.match(/REST API built with FastAPI/g) ?? []).length
    expect(count).toBe(1)
  })

  it('truncates total context at ~2000 token budget', () => {
    // Create many large chunks
    const results = Array.from({ length: 20 }, (_, i) =>
      makeResult('a'.repeat(400) + ` chunk-${i}`, 0.8 - i * 0.01),
    )
    const { contextText } = buildContext(results)
    // 2000 tokens ≈ 8000 chars — context should not greatly exceed this
    expect(contextText.length).toBeLessThan(12000)
  })

  it('formats source markers with repo and type', () => {
    const results = [
      makeResult('Commit message about auth fix', 0.75, {
        type: 'commit',
        repo: 'auth-service',
        date: '2024-06-01T00:00:00Z',
      }),
    ]
    const { contextText } = buildContext(results)
    expect(contextText).toContain('auth-service')
    expect(contextText).toContain('commit')
  })

  it('handles single result correctly', () => {
    const results = [makeResult('Only one chunk of content here', 0.85)]
    const { contextText } = buildContext(results)
    expect(contextText).toContain('Only one chunk')
    expect(contextText).toContain('[Source:')
  })
})
