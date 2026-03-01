import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SearchResult } from '@/types'

// Mock the vector store
vi.mock('@/lib/vector-store', () => ({
  getVectorStore: () => ({
    search: vi.fn().mockResolvedValue([
      { text: 'Python FastAPI backend', score: 0.85, metadata: { type: 'repo_overview', source: 'github', repo: 'api-service' } },
      { text: 'TypeScript React frontend', score: 0.72, metadata: { type: 'repo_overview', source: 'github', repo: 'ui-app' } },
      { text: 'Barely relevant content', score: 0.28, metadata: { type: 'commit', source: 'github', repo: 'misc-repo' } },
      { text: 'Completely unrelated', score: 0.15, metadata: { type: 'issue', source: 'github', repo: 'other-repo' } },
    ] as SearchResult[]),
    isReady: () => true,
  }),
}))

// Mock the embeddings module
vi.mock('@/lib/embeddings', () => ({
  generateQueryEmbedding: vi.fn().mockResolvedValue(new Array(1536).fill(0.1)),
}))

describe('retrieveContext', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('filters out chunks below the 0.25 score threshold', async () => {
    const { retrieveContext } = await import('@/lib/rag/retriever')
    const result = await retrieveContext('tell me about your projects')

    // Score 0.15 should be filtered out
    const scores = result.chunks.map((c) => c.score)
    expect(scores.every((s) => s >= 0.25)).toBe(true)
    expect(result.chunks).toHaveLength(3)
  })

  it('respects the topK parameter', async () => {
    const { retrieveContext } = await import('@/lib/rag/retriever')
    const result = await retrieveContext('test query', { topK: 1 })
    expect(result.chunks.length).toBeLessThanOrEqual(1)
  })

  it('populates debugInfo correctly', async () => {
    const { retrieveContext } = await import('@/lib/rag/retriever')
    const result = await retrieveContext('what languages do you use?')

    expect(result.debugInfo).toBeDefined()
    expect(result.debugInfo.query).toBe('what languages do you use?')
    expect(result.debugInfo.embeddingTimeMs).toBeGreaterThanOrEqual(0)
    expect(result.debugInfo.searchTimeMs).toBeGreaterThanOrEqual(0)
    expect(result.debugInfo.topScores).toBeInstanceOf(Array)
    expect(result.debugInfo.chunks).toBeInstanceOf(Array)
  })

  it('returns contextText as formatted string with source markers', async () => {
    const { retrieveContext } = await import('@/lib/rag/retriever')
    const result = await retrieveContext('backend experience')

    expect(typeof result.contextText).toBe('string')
    expect(result.contextText).toContain('[S1]')
    expect(result.contextText).toContain('Python FastAPI')
  })

  it('handles empty vector store gracefully', async () => {
    // For this test we want 0 results — we can test by using minScore=1.0
    // which would filter out all results (max score is 0.85 in the mock)
    const { retrieveContext } = await import('@/lib/rag/retriever')
    const result = await retrieveContext('some question', { minScore: 0.99 })

    expect(result.chunks).toHaveLength(0)
    expect(result.contextText).toBe('')
  })

  it('uses minScore option to override threshold', async () => {
    const { retrieveContext } = await import('@/lib/rag/retriever')
    // With minScore 0.8, only the 0.85 chunk should pass (0.72 < 0.8)
    const result = await retrieveContext('query', { minScore: 0.8, topK: 5 })
    
    expect(result.chunks.length).toBe(1)
    expect(result.chunks[0].score).toBe(0.85)
    expect(result.chunks.every((c) => c.score >= 0.8)).toBe(true)
  })
})
