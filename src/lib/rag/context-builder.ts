import { estimateTokens } from '@/lib/utils'
import type { SearchResult } from '@/types'

const MAX_CONTEXT_TOKENS = 8000

/**
 * Assembles retrieved chunks into a clean context block for the system prompt.
 *
 * - Deduplicates overlapping chunks (from README splits with overlap)
 * - Orders by relevance score (highest first)
 * - Truncates total context to MAX_CONTEXT_TOKENS
 * - Adds clear source markers the LLM can reference
 */
export function buildContext(results: SearchResult[]): string {
  if (results.length === 0) return ''

  // Sort by score descending
  const sorted = [...results].sort((a, b) => b.score - a.score)

  // Deduplicate overlapping chunks using similarity of text content
  const deduplicated = deduplicateChunks(sorted)

  // Truncate to token budget
  const contextParts: string[] = []
  let totalTokens = 0

  for (const result of deduplicated) {
    const chunkText = formatChunk(result)
    const chunkTokens = estimateTokens(chunkText)

    if (totalTokens + chunkTokens > MAX_CONTEXT_TOKENS) {
      // Try to fit a truncated version
      const remainingTokens = MAX_CONTEXT_TOKENS - totalTokens
      if (remainingTokens > 100) {
        const truncatedText = result.text.slice(0, remainingTokens * 4)
        contextParts.push(formatChunk({ ...result, text: truncatedText + '...' }))
      }
      break
    }

    contextParts.push(chunkText)
    totalTokens += chunkTokens
  }

  return contextParts.join('\n\n---\n\n')
}

function formatChunk(result: SearchResult): string {
  const sourceLabel = buildSourceLabel(result)
  return `[Source: ${sourceLabel}]\n${result.text}`
}

function buildSourceLabel(result: SearchResult): string {
  const parts: string[] = []

  if (result.metadata.source === 'notion') {
    parts.push('Notion')
    if (result.metadata.title) parts.push(result.metadata.title)
  } else {
    if (result.metadata.repo) parts.push(result.metadata.repo)
    parts.push(result.metadata.type.replace(/_/g, ' '))
  }

  if (result.metadata.date) {
    parts.push(
      new Date(result.metadata.date).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
      }),
    )
  }
  if (result.metadata.section) parts.push(`§${result.metadata.section}`)

  return parts.join(', ')
}

/**
 * Removes chunks that are very similar to higher-ranked chunks.
 * Detects README overlap by checking if a chunk's text is contained in another.
 */
function deduplicateChunks(sorted: SearchResult[]): SearchResult[] {
  const seen: Set<string> = new Set()
  const deduplicated: SearchResult[] = []

  for (const chunk of sorted) {
    // Check if this chunk's content is already substantially covered
    const normalizedText = chunk.text.toLowerCase().replace(/\s+/g, ' ').trim()

    let isDuplicate = false
    for (const seenText of Array.from(seen)) {
      const overlap = computeOverlap(normalizedText, seenText)
      if (overlap > 0.7) {
        isDuplicate = true
        break
      }
    }

    if (!isDuplicate) {
      seen.add(normalizedText)
      deduplicated.push(chunk)
    }
  }

  return deduplicated
}

/**
 * Compute approximate overlap ratio between two text strings.
 * Uses a sliding window of shared n-grams to detect when two chunks
 * have substantially the same content (e.g., README overlap sections).
 */
function computeOverlap(a: string, b: string): number {
  if (a.length < 50 || b.length < 50) return 0

  // Check for shared prefix — the most common overlap case (README split overlap)
  const maxPrefixLen = Math.floor(Math.min(a.length, b.length) * 0.7)
  const prefixA = a.slice(0, maxPrefixLen)
  const prefixB = b.slice(0, maxPrefixLen)

  // Count shared words in the prefix
  const wordsA = new Set(prefixA.split(/\s+/).filter((w) => w.length > 3))
  const wordsB = new Set(prefixB.split(/\s+/).filter((w) => w.length > 3))
  if (wordsA.size === 0 || wordsB.size === 0) return 0

  let sharedCount = 0
  for (const w of Array.from(wordsA)) {
    if (wordsB.has(w)) sharedCount++
  }

  const jaccardApprox = sharedCount / Math.max(wordsA.size, wordsB.size)
  return jaccardApprox
}
