import OpenAI from 'openai'
import { sleep } from '@/lib/utils'

const EMBEDDING_MODEL = 'text-embedding-3-small'
const EMBEDDING_DIMENSIONS = 1536
const BATCH_SIZE = 100
const MAX_RETRIES = 3

let _openaiClient: OpenAI | null = null

function getClient(): OpenAI {
  if (!_openaiClient) {
    _openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! })
  }
  return _openaiClient
}

/**
 * Generate embeddings for an array of texts using text-embedding-3-small.
 * Batches requests to stay within API limits and handles rate limits with
 * exponential backoff.
 *
 * Cost: ~$0.02 per 1M tokens (typical profile < $0.01 total)
 */
export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return []

  const client = getClient()
  const allEmbeddings: number[][] = []

  // Process in batches of BATCH_SIZE
  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE)
    const embeddings = await generateBatchWithRetry(client, batch)
    allEmbeddings.push(...embeddings)
  }

  return allEmbeddings
}

async function generateBatchWithRetry(client: OpenAI, texts: string[]): Promise<number[][]> {
  let lastError: Error | null = null

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const response = await client.embeddings.create({
        model: EMBEDDING_MODEL,
        input: texts,
        dimensions: EMBEDDING_DIMENSIONS,
      })

      // Sort by index to ensure order matches input
      const sorted = response.data.sort((a, b) => a.index - b.index)
      return sorted.map((item) => item.embedding)
    } catch (err) {
      lastError = err as Error
      const isRateLimit =
        (err as { status?: number }).status === 429 ||
        (err as Error).message?.includes('rate limit')

      if (isRateLimit) {
        const backoffMs = Math.pow(2, attempt) * 1000
        console.warn(`[Embeddings] Rate limited. Retrying in ${backoffMs}ms (attempt ${attempt + 1}/${MAX_RETRIES})`)
        await sleep(backoffMs)
      } else {
        throw err
      }
    }
  }

  throw lastError ?? new Error('Failed to generate embeddings after max retries')
}

/**
 * Generate a single embedding for a query string.
 */
export async function generateQueryEmbedding(query: string): Promise<number[]> {
  const embeddings = await generateEmbeddings([query])
  return embeddings[0]
}

export { EMBEDDING_DIMENSIONS }
