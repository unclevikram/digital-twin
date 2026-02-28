import type { IngestionProgress } from '@/types'

/**
 * In-memory ingestion status tracker.
 * Keyed by user ID — supports concurrent users in theory, though this is a single-user app.
 *
 * Note: Ephemeral on Vercel serverless. Status resets on cold starts,
 * but the vector index itself persists on disk (or needs re-ingestion).
 */
const statusMap = new Map<string, IngestionProgress>()

export function getIngestionStatus(userId: string): IngestionProgress {
  return (
    statusMap.get(userId) ?? {
      status: 'idle',
      progress: 0,
      message: 'Not started',
    }
  )
}

export function setIngestionStatus(userId: string, status: IngestionProgress): void {
  statusMap.set(userId, status)
}

export function updateIngestionProgress(
  userId: string,
  updates: Partial<IngestionProgress>,
): void {
  const current = getIngestionStatus(userId)
  statusMap.set(userId, { ...current, ...updates })
}

export function clearIngestionStatus(userId: string): void {
  statusMap.delete(userId)
}
