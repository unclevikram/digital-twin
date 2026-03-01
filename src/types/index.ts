// ============================================
// Shared TypeScript Types — Digital Twin MVP
// ============================================

// ---- Chat Types ----

export interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  createdAt?: Date
  sources?: ChunkSource[]
  debugInfo?: RetrievalDebugInfo
}

export interface ChunkSource {
  sourceId: string
  source: 'github'
  title?: string
  repo?: string
  type: string
  section?: string
  date?: string
  url?: string
  snippet?: string
  score: number
}

export interface RetrievalConfidence {
  level: 'high' | 'medium' | 'low'
  score: number
  reason: string
}

export interface RetrievalDebugInfo {
  query: string
  expandedQueries?: string[]
  embeddingTimeMs: number
  searchTimeMs: number
  totalChunksSearched: number
  topScores: number[]
  confidence: RetrievalConfidence
  chunks: Array<{
    sourceId: string
    source: 'github'
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

// ---- Ingestion Types ----

export type IngestionStatus =
  | 'idle'
  | 'fetching'
  | 'chunking'
  | 'embedding'
  | 'storing'
  | 'complete'
  | 'error'

export interface IngestionProgress {
  status: IngestionStatus
  progress: number // 0-100
  message: string
  error?: string
  stats?: IngestionStats
  startedAt?: string
  completedAt?: string
}

export interface IngestionStats {
  totalRepos: number
  totalCommits: number
  totalPRs: number
  totalIssues: number
  totalReadmes: number
  totalChunks: number
  totalEmbeddings: number
  fetchDurationMs: number
  ingestDurationMs: number
  chunksByType: Record<string, number>
}

export interface IngestionResult {
  success: boolean
  stats: IngestionStats
  error?: string
}

// ---- Vector Store Types ----

export type ChunkType =
  | 'profile'
  | 'repo_overview'
  | 'readme'
  | 'commit'
  | 'pull_request'
  | 'issue'
  | 'contribution_summary'
  | 'language_summary'

export interface ChunkMetadata {
  type: ChunkType
  source: 'github'
  visibility?: 'public_professional' | 'private_personal' | 'sensitive'
  repo?: string // For GitHub
  title?: string
  date?: string
  language?: string
  url?: string
  labels?: string[]
  section?: string
}

export interface DataChunk {
  id: string
  text: string
  type: ChunkType
  metadata: ChunkMetadata
}

export interface SearchResult {
  id?: string
  text: string
  score: number
  metadata: ChunkMetadata
}

export interface VectorStoreStats {
  totalChunks: number
  chunksByType: Record<string, number>
}
