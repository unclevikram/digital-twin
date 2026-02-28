import { generateQueryEmbedding } from '@/lib/embeddings'
import { getVectorStore } from '@/lib/vector-store'
import { buildContext } from '@/lib/rag/context-builder'
import { expandQuery } from '@/lib/rag/query-expansion'
import type { SearchResult } from '@/types'

const DEFAULT_TOP_K = 10
const MIN_SCORE_THRESHOLD = 0.25

export interface RetrievalResult {
  chunks: SearchResult[]
  contextText: string
  debugInfo: {
    query: string
    expandedQueries: string[]
    embeddingTimeMs: number
    searchTimeMs: number
    totalChunksSearched: number
    topScores: number[]
    chunks: Array<{
      text: string
      score: number
      type: string
      repo?: string
    }>
  }
}

/**
 * Retrieves relevant context chunks for a given query.
 *
 * Steps:
 * 1. Expand the query into 2 alternative phrasings (in parallel with primary embedding)
 * 2. Embed all queries simultaneously
 * 3. Search Vectra with each embedding in parallel
 * 4. Merge results, deduplicate by text prefix, sort by score
 * 5. Filter out chunks below min score threshold
 * 6. Build context string with token budget via context-builder
 */
export async function retrieveContext(
  query: string,
  options?: { topK?: number; minScore?: number },
): Promise<RetrievalResult> {
  const topK = options?.topK ?? DEFAULT_TOP_K
  const minScore = options?.minScore ?? MIN_SCORE_THRESHOLD

  // ---- Step 1 & 2: Embed primary query + expand in parallel ----
  const embeddingStart = Date.now()
  const [queryEmbedding, expandedQueries] = await Promise.all([
    generateQueryEmbedding(query),
    expandQuery(query),
  ])

  // Embed expanded queries (if any) in parallel
  const expandedEmbeddings =
    expandedQueries.length > 0
      ? await Promise.all(expandedQueries.map((q) => generateQueryEmbedding(q)))
      : []
  const embeddingTimeMs = Date.now() - embeddingStart

  // ---- Step 3: Search all embeddings in parallel ----
  const searchStart = Date.now()
  const vectorStore = getVectorStore()

  let allResults: SearchResult[] = []
  try {
    const searchPromises = [
      vectorStore.search(queryEmbedding, topK * 3),
      ...expandedEmbeddings.map((emb) => vectorStore.search(emb, topK * 2)),
    ]

    const resultSets = await Promise.all(
      searchPromises.map((p) => p.catch((): SearchResult[] => [])),
    )

    // ---- Step 4: Merge + deduplicate by text prefix ----
    const seen = new Set<string>()
    for (const results of resultSets) {
      for (const r of results) {
        const key = r.text.slice(0, 80).toLowerCase()
        if (!seen.has(key)) {
          seen.add(key)
          allResults.push(r)
        }
      }
    }

    // Sort merged results by score descending
    allResults.sort((a, b) => b.score - a.score)
  } catch (err) {
    console.warn('[Retriever] Vector search failed:', err)
  }
  const searchTimeMs = Date.now() - searchStart

  // ---- Step 5: Filter by score threshold ----
  const filteredResults = allResults.filter((r) => r.score >= minScore).slice(0, topK)

  // ---- Step 6: Build context with token budget ----
  const contextText = buildContext(filteredResults)

  return {
    chunks: filteredResults,
    contextText,
    debugInfo: {
      query,
      expandedQueries,
      embeddingTimeMs,
      searchTimeMs,
      totalChunksSearched: allResults.length,
      topScores: allResults.slice(0, 5).map((r) => r.score),
      chunks: filteredResults.map((r) => ({
        text: r.text.slice(0, 200),
        score: r.score,
        type: r.metadata.type,
        repo: r.metadata.repo,
      })),
    },
  }
}
