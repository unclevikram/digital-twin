import type { SearchResult } from '@/types'
import type { QuerySafetyDecision } from './policy'

const PERSONAL_HINTS: RegExp[] = [
  // Relaxed: removed personal topic filters
]

export function filterChunksForProfessionalUse(
  chunks: SearchResult[],
  decision: QuerySafetyDecision,
): SearchResult[] {
  if (!decision.allow && decision.mode === 'refuse') return []

  return chunks.filter((chunk) => {
    const visibility = chunk.metadata.visibility
    // Only filter strictly sensitive items
    if (visibility === 'sensitive') return false

    // Allow everything else
    return true
  })
}
