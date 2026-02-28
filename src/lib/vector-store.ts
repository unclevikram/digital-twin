import path from 'path'
import type { ChunkMetadata, SearchResult, VectorStoreStats } from '@/types'

const VECTOR_INDEX_DIR = path.join(process.cwd(), 'vector-index')

/**
 * VectorStore interface — abstracting away Vectra so the implementation
 * is swappable. In production, this would point to Pinecone or pgvector.
 */
export interface VectorStore {
  initialize(): Promise<void>
  addChunks(
    chunks: Array<{ id: string; text: string; embedding: number[]; metadata: ChunkMetadata }>,
  ): Promise<void>
  search(
    queryEmbedding: number[],
    topK?: number,
    filter?: Partial<ChunkMetadata>,
  ): Promise<SearchResult[]>
  getStats(): Promise<VectorStoreStats>
  clear(): Promise<void>
  isReady(): boolean
}

/**
 * Vectra implementation of VectorStore.
 * File-backed local vector database — zero infrastructure required.
 * Trade-off: not suitable for >100K vectors, but perfect for single-user demo scope.
 */
class VectraVectorStore implements VectorStore {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private index: any = null
  private ready = false
  private readonly indexDir: string

  constructor(indexDir: string = VECTOR_INDEX_DIR) {
    this.indexDir = indexDir
  }

  async initialize(): Promise<void> {
    try {
      // Dynamic import to avoid issues with Next.js module resolution
      const { LocalIndex } = await import('vectra')
      this.index = new LocalIndex(this.indexDir)

      if (!(await this.index.isIndexCreated())) {
        await this.index.createIndex()
        console.log(`[VectorStore] Created new index at ${this.indexDir}`)
      } else {
        console.log(`[VectorStore] Loaded existing index from ${this.indexDir}`)
      }
      this.ready = true
    } catch (err) {
      console.error('[VectorStore] Failed to initialize:', err)
      throw err
    }
  }

  isReady(): boolean {
    return this.ready
  }

  async addChunks(
    chunks: Array<{ id: string; text: string; embedding: number[]; metadata: ChunkMetadata }>,
  ): Promise<void> {
    if (!this.ready) await this.initialize()

    // Get existing items to support upsert behavior
    const existingItems = await this.index.listItems()
    const existingIds = new Set(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      existingItems.map((item: any) => item.metadata?._id as string).filter(Boolean),
    )

    let added = 0
    let updated = 0

    for (const chunk of chunks) {
      if (existingIds.has(chunk.id)) {
        // Delete existing item before re-inserting (upsert behavior)
        const existing = existingItems.find(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (item: any) => item.metadata?._id === chunk.id,
        )
        if (existing) {
          await this.index.deleteItem(existing.id)
        }
        updated++
      } else {
        added++
      }

      await this.index.insertItem({
        vector: chunk.embedding,
        metadata: {
          _id: chunk.id,
          text: chunk.text,
          ...chunk.metadata,
        },
      })
    }

    console.log(`[VectorStore] Added ${added} new chunks, updated ${updated} existing chunks`)
  }

  async search(
    queryEmbedding: number[],
    topK: number = 5,
    filter?: Partial<ChunkMetadata>,
  ): Promise<SearchResult[]> {
    if (!this.ready) await this.initialize()

    console.log('[VectorStore] queryItems called, indexDir:', this.indexDir, 'topK*3:', topK * 3, 'vectorLen:', queryEmbedding.length)
    const results = await this.index.queryItems(queryEmbedding, topK * 3)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    console.log('[VectorStore] queryItems returned', results.length, 'raw results, top scores:', results.slice(0, 3).map((r: any) => r.score?.toFixed(4)))

    const filtered = results
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .filter((result: any) => {
        if (!filter) return true
        const meta = result.item.metadata
        return Object.entries(filter).every(([key, value]) => meta[key] === value)
      })
      .slice(0, topK)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return filtered.map((result: any) => ({
      text: result.item.metadata.text as string,
      score: result.score as number,
      metadata: {
        type: result.item.metadata.type,
        repo: result.item.metadata.repo,
        date: result.item.metadata.date,
        language: result.item.metadata.language,
        url: result.item.metadata.url,
        labels: result.item.metadata.labels,
        section: result.item.metadata.section,
      } as ChunkMetadata,
    }))
  }

  async getStats(): Promise<VectorStoreStats> {
    if (!this.ready) {
      try {
        await this.initialize()
      } catch {
        return { totalChunks: 0, chunksByType: {} }
      }
    }

    const items = await this.index.listItems()
    const chunksByType: Record<string, number> = {}

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const item of items) {
      const type = (item.metadata?.type as string) ?? 'unknown'
      chunksByType[type] = (chunksByType[type] ?? 0) + 1
    }

    return {
      totalChunks: items.length,
      chunksByType,
    }
  }

  async clear(): Promise<void> {
    if (!this.ready) await this.initialize()
    const items = await this.index.listItems()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const item of items) {
      await this.index.deleteItem(item.id)
    }
    console.log(`[VectorStore] Cleared ${items.length} chunks`)
  }
}

// Singleton instance
let _vectorStore: VectorStore | null = null

export function getVectorStore(): VectorStore {
  if (!_vectorStore) {
    _vectorStore = new VectraVectorStore()
  }
  return _vectorStore
}

export { VectraVectorStore }
