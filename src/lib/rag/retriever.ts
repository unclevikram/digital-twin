import { generateQueryEmbedding } from '@/lib/embeddings'
import { getVectorStore } from '@/lib/vector-store'
import { buildContext } from '@/lib/rag/context-builder'
import { expandQuery } from '@/lib/rag/query-expansion'
import type { ChunkSource, RetrievalConfidence, SearchResult } from '@/types'

const DEFAULT_TOP_K = 10
const MIN_SCORE_THRESHOLD = 0.25

export interface RetrievalResult {
  chunks: SearchResult[]
  sources: ChunkSource[]
  contextText: string
  debugInfo: {
    query: string
    expandedQueries: string[]
    embeddingTimeMs: number
    searchTimeMs: number
    totalChunksSearched: number
    topScores: number[]
    confidence: RetrievalConfidence
    chunks: Array<{
      sourceId: string
      source: 'github' | 'notion'
      text: string
      score: number
      type: string
      repo?: string
      title?: string
      section?: string
      date?: string
      url?: string
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
 * 4. Merge results, deduplicate + diversify by source type, sort by score
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

    // ---- Step 4: Merge + deduplicate by content/source ----
    const seen = new Set<string>()
    for (const results of resultSets) {
      for (const r of results) {
        const key = [
          r.metadata.source,
          r.metadata.type,
          r.metadata.repo ?? '',
          r.metadata.title ?? '',
          r.text.slice(0, 120).toLowerCase(),
        ].join('|')
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

  // ---- Step 5: Filter by score threshold and limit per type for diversity ----
  const filteredByScore = allResults.filter((r) => r.score >= minScore)
  const typeCounts: Record<string, number> = {}
  const MAX_PER_TYPE = 4
  const filteredResults: SearchResult[] = []
  for (const r of filteredByScore) {
    const type = r.metadata.type
    if ((typeCounts[type] ?? 0) >= MAX_PER_TYPE) continue
    filteredResults.push(r)
    typeCounts[type] = (typeCounts[type] ?? 0) + 1
    if (filteredResults.length >= topK) break
  }

  // ---- Step 6: Build context with token budget ----
  const context = buildContext(filteredResults)
  const confidence = scoreConfidence(filteredResults)

  return {
    chunks: filteredResults,
    sources: context.sources,
    contextText: context.contextText,
    debugInfo: {
      query,
      expandedQueries,
      embeddingTimeMs,
      searchTimeMs,
      totalChunksSearched: allResults.length,
      topScores: allResults.slice(0, 5).map((r) => r.score),
      confidence,
      chunks: context.sources.map((source) => ({
        sourceId: source.sourceId,
        source: source.source,
        text: source.snippet ?? '',
        score: source.score,
        type: source.type,
        repo: source.repo,
        title: source.title,
        section: source.section,
        date: source.date,
        url: source.url,
      })),
    },
  }
}

function scoreConfidence(chunks: SearchResult[]): RetrievalConfidence {
  if (chunks.length === 0) {
    return {
      level: 'low',
      score: 0,
      reason: 'No relevant evidence retrieved for this query.',
    }
  }

  const topScore = chunks[0]?.score ?? 0
  const topThree = chunks.slice(0, 3)
  const avgTop = topThree.reduce((sum, chunk) => sum + chunk.score, 0) / topThree.length
  const distinctSources = new Set(
    chunks.map((chunk) => `${chunk.metadata.source}:${chunk.metadata.repo ?? chunk.metadata.title ?? 'global'}`),
  ).size

  const score = Math.min(
    1,
    topScore * 0.55 + avgTop * 0.35 + Math.min(distinctSources / 3, 1) * 0.1,
  )

  if (score >= 0.72) {
    return {
      level: 'high',
      score,
      reason: 'High relevance and good evidence coverage across sources.',
    }
  }

  if (score >= 0.5) {
    return {
      level: 'medium',
      score,
      reason: 'Moderate evidence quality; some claims may need clarification.',
    }
  }

  return {
    level: 'low',
    score,
    reason: 'Weak or sparse evidence; ask clarifying question or fetch live data.',
  }
}
