import type { SearchResult } from '@/types'
import type { QuerySafetyDecision } from './policy'

const PERSONAL_HINTS: RegExp[] = [
  /\b(grocery|laundry|photos backup|shopping list|personal task|habit tracker)\b/i,
  /\bdoctor|hospital|medication|therapy\b/i,
  /\bfamily|girlfriend|boyfriend|relationship\b/i,
  /\bhome address|phone number|private email\b/i,
]

export function filterChunksForProfessionalUse(
  chunks: SearchResult[],
  decision: QuerySafetyDecision,
): SearchResult[] {
  if (!decision.allow && decision.mode === 'refuse') return []

  return chunks.filter((chunk) => {
    const visibility = chunk.metadata.visibility
    if (visibility === 'sensitive' || visibility === 'private_personal') return false

    const text = chunk.text ?? ''
    if (PERSONAL_HINTS.some((re) => re.test(text))) return false

    return true
  })
}
