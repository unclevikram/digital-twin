import { fetchGitHubData } from '@/lib/github/fetcher'
import {
  chunkProfile,
  chunkRepos,
  chunkReadme,
  chunkCommits,
  chunkPullRequests,
  chunkIssues,
  chunkLanguages,
  chunkContributions,
} from './chunker'
import { generateEmbeddings } from '@/lib/embeddings'
import { getVectorStore } from '@/lib/vector-store'
import { setIngestionStatus, updateIngestionProgress } from './status'
import type { DataChunk, IngestionProgress, IngestionResult, IngestionStats } from '@/types'
import path from 'path'
import fs from 'fs/promises'

const VECTOR_INDEX_DIR = path.join(process.cwd(), 'vector-index')
const RAW_DATA_PATH = path.join(VECTOR_INDEX_DIR, 'raw-github-data.json')
const EMBEDDING_BATCH_SIZE = 50

type ProgressCallback = (progress: IngestionProgress) => void

/**
 * Full ingestion pipeline: Fetch → Chunk → Embed → Store
 *
 * Steps:
 * 1. Fetch GitHub data          (0-40%)
 * 2. Chunk all data             (40-60%)
 * 3. Generate embeddings        (60-90%)
 * 4. Store in vector index      (90-100%)
 */
export async function runIngestionPipeline(
  accessToken: string,
  userId: string,
  onProgress?: ProgressCallback,
): Promise<IngestionResult> {
  const startTime = Date.now()

  const report = (status: IngestionProgress) => {
    setIngestionStatus(userId, status)
    onProgress?.(status)
  }

  try {
    // Ensure vector-index directory exists
    await fs.mkdir(VECTOR_INDEX_DIR, { recursive: true })

    // ---- Phase 1: Fetch GitHub Data (0-40%) ----
    report({
      status: 'fetching',
      progress: 2,
      message: 'Connecting to GitHub...',
    })

    const githubData = await fetchGitHubData(accessToken, (fetchProgress) => {
      const mappedProgress = 2 + Math.round(fetchProgress.percentage * 0.38)
      updateIngestionProgress(userId, {
        progress: mappedProgress,
        message: fetchProgress.step,
      })
    })

    // Persist raw data for debugging and decoupled re-ingestion
    await fs.writeFile(RAW_DATA_PATH, JSON.stringify(githubData, null, 2), 'utf-8')
    console.log(`[Pipeline] Raw data saved to ${RAW_DATA_PATH}`)

    // ---- Phase 2: Chunk All Data (40-60%) ----
    report({
      status: 'chunking',
      progress: 40,
      message: 'Building knowledge base...',
    })

    const allChunks: DataChunk[] = [
      ...chunkProfile(githubData.profile),
      ...chunkRepos(githubData.repos),
      ...githubData.readmes.flatMap((readme) => chunkReadme(readme)),
      ...chunkCommits(githubData.commits),
      ...chunkPullRequests(githubData.pullRequests),
      ...chunkIssues(githubData.issues),
      ...chunkLanguages(githubData.languages),
      ...chunkContributions(githubData.contributions),
    ]

    console.log(`[Pipeline] Created ${allChunks.length} chunks`)

    // Count chunks by type
    const chunksByType: Record<string, number> = {}
    for (const chunk of allChunks) {
      chunksByType[chunk.type] = (chunksByType[chunk.type] ?? 0) + 1
    }

    updateIngestionProgress(userId, {
      progress: 55,
      message: `Chunked ${allChunks.length} knowledge pieces...`,
    })

    // ---- Phase 3: Generate Embeddings (60-90%) ----
    report({
      status: 'embedding',
      progress: 60,
      message: `Generating embeddings for ${allChunks.length} chunks...`,
    })

    const texts = allChunks.map((chunk) => chunk.text)
    const allEmbeddings: number[][] = []

    for (let i = 0; i < texts.length; i += EMBEDDING_BATCH_SIZE) {
      const batch = texts.slice(i, i + EMBEDDING_BATCH_SIZE)
      const batchEmbeddings = await generateEmbeddings(batch)
      allEmbeddings.push(...batchEmbeddings)

      const embeddingProgress = 60 + Math.round(((i + batch.length) / texts.length) * 28)
      updateIngestionProgress(userId, {
        progress: Math.min(embeddingProgress, 88),
        message: `Embedding ${i + batch.length}/${texts.length} chunks...`,
      })
    }

    // ---- Phase 4: Store in Vector Index (90-100%) ----
    report({
      status: 'storing',
      progress: 90,
      message: 'Storing in knowledge base...',
    })

    const vectorStore = getVectorStore()
    await vectorStore.initialize()

    const chunksWithEmbeddings = allChunks.map((chunk, i) => ({
      id: chunk.id,
      text: chunk.text,
      embedding: allEmbeddings[i],
      metadata: chunk.metadata,
    }))

    await vectorStore.addChunks(chunksWithEmbeddings)

    const ingestDurationMs = Date.now() - startTime

    const stats: IngestionStats = {
      totalRepos: githubData.stats.totalRepos,
      totalCommits: githubData.stats.totalCommits,
      totalPRs: githubData.stats.totalPRs,
      totalIssues: githubData.stats.totalIssues,
      totalReadmes: githubData.stats.totalReadmes,
      totalChunks: allChunks.length,
      totalEmbeddings: allEmbeddings.length,
      fetchDurationMs: githubData.stats.fetchDurationMs,
      ingestDurationMs,
      chunksByType,
    }

    report({
      status: 'complete',
      progress: 100,
      message: `Your twin is ready! Ingested ${allChunks.length} knowledge chunks.`,
      stats,
      completedAt: new Date().toISOString(),
    })

    return { success: true, stats }
  } catch (err) {
    const error = err instanceof Error ? err.message : 'Unknown error during ingestion'
    console.error('[Pipeline] Ingestion failed:', err)

    setIngestionStatus(userId, {
      status: 'error',
      progress: 0,
      message: 'Ingestion failed',
      error,
    })

    return {
      success: false,
      stats: {
        totalRepos: 0,
        totalCommits: 0,
        totalPRs: 0,
        totalIssues: 0,
        totalReadmes: 0,
        totalChunks: 0,
        totalEmbeddings: 0,
        fetchDurationMs: 0,
        ingestDurationMs: Date.now() - startTime,
        chunksByType: {},
      },
      error,
    }
  }
}
