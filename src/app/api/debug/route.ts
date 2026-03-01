import { NextResponse } from 'next/server'
import { retrieveContext } from '@/lib/rag/retriever'
import { getVectorStore } from '@/lib/vector-store'

export const dynamic = 'force-dynamic'

/**
 * Temporary debug endpoint — tests retrieval directly from the Next.js server context.
 * Hit GET /api/debug?q=your+question to see raw retrieval results.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const query = searchParams.get('q') ?? 'What projects has Vikram worked on?'

  // Step 1: vector store stats
  const vectorStore = getVectorStore()
  const stats = await vectorStore.getStats()

  // Step 2: raw retrieval
  try {
    const retrieval = await retrieveContext(query, { topK: 5, minScore: 0.3 })
    return NextResponse.json({
      query,
      vectorStoreStats: stats,
      embeddingTimeMs: retrieval.debugInfo.embeddingTimeMs,
      searchTimeMs: retrieval.debugInfo.searchTimeMs,
      totalChunksSearched: retrieval.debugInfo.totalChunksSearched,
      topScores: retrieval.debugInfo.topScores,
      chunksReturned: retrieval.chunks.length,
      contextSnippet: retrieval.contextText.slice(0, 500),
    })
  } catch (err) {
    return NextResponse.json({
      error: String(err),
      vectorStoreStats: stats,
    }, { status: 500 })
  }
}
