import { notionClient } from './client'
import { NotionToMarkdown } from 'notion-to-md'
import { generateId, estimateTokens } from '@/lib/utils'
import type { DataChunk } from '@/types'
import { env } from '@/lib/env'

const n2m = new NotionToMarkdown({ notionClient })

const MAX_TOKENS = 500
const OVERLAP_TOKENS = 50

export async function fetchAndChunkNotionPages(): Promise<DataChunk[]> {
  if (!env.NOTION_API_KEY) {
    console.warn('NOTION_API_KEY not found, skipping Notion ingestion')
    return []
  }

  console.log('Fetching Notion pages...')
  const response = await notionClient.search({
    filter: {
      value: 'page',
      property: 'object',
    },
    sort: {
      direction: 'descending',
      timestamp: 'last_edited_time',
    },
    page_size: 20, // Limit for MVP
  })

  const chunks: DataChunk[] = []

  for (const page of response.results) {
    if (!('url' in page) || !('properties' in page)) continue

    const pageId = page.id
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const titleProp = (page as any).properties.title || (page as any).properties.Name
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const title = titleProp?.title?.[0]?.plain_text ?? 'Untitled'

    console.log(`Processing Notion page: ${title} (${pageId})`)

    try {
      const mdBlocks = await n2m.pageToMarkdown(pageId)
      const markdown = extractMarkdownText(n2m.toMarkdownString(mdBlocks))
      if (!markdown.trim()) {
        console.log(`Skipping Notion page with empty markdown: ${title} (${pageId})`)
        continue
      }

      const pageChunks = chunkNotionContent(markdown, {
        pageId,
        title,
        visibility: inferNotionVisibility(title, markdown),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        url: (page as any).url,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        lastEdited: (page as any).last_edited_time,
      })

      chunks.push(...pageChunks)
    } catch (err) {
      console.warn(`Failed to process Notion page: ${title} (${pageId})`, err)
      continue
    }
  }

  return chunks
}

function extractMarkdownText(markdownOutput: unknown): string {
  if (typeof markdownOutput === 'string') return markdownOutput
  if (
    typeof markdownOutput === 'object' &&
    markdownOutput !== null &&
    'parent' in markdownOutput &&
    typeof (markdownOutput as { parent?: unknown }).parent === 'string'
  ) {
    return (markdownOutput as { parent: string }).parent
  }
  return ''
}

function chunkNotionContent(
  content: string,
  meta: {
    pageId: string
    title: string
    visibility: 'public_professional' | 'private_personal' | 'sensitive'
    url: string
    lastEdited: string
  }
): DataChunk[] {
  const chunks: DataChunk[] = []
  const prefix = `[Notion: ${meta.title}] `
  
  // Split by double newlines to get paragraphs
  const paragraphs = content.split('\n\n').filter(p => p.trim())
  
  let currentChunk = ''
  let chunkIndex = 0
  
  for (const paragraph of paragraphs) {
    const candidate = currentChunk + paragraph + '\n\n'
    
    if (estimateTokens(prefix + candidate) > MAX_TOKENS && currentChunk.trim()) {
      chunks.push({
        id: generateId(['notion', meta.pageId, String(chunkIndex)]),
        text: prefix + currentChunk.trim(),
        type: 'notion_page',
        metadata: {
          type: 'notion_page',
          source: 'notion',
          visibility: meta.visibility,
          pageId: meta.pageId,
          title: meta.title,
          url: meta.url,
          date: meta.lastEdited,
        }
      })
      
      // Simple overlap logic
      const words = currentChunk.split(' ')
      // Keep last 50 words approx
      const overlap = words.slice(-OVERLAP_TOKENS).join(' ')
      currentChunk = overlap + '\n' + paragraph + '\n\n'
      chunkIndex++
    } else {
      currentChunk += paragraph + '\n\n'
    }
  }
  
  if (currentChunk.trim()) {
    chunks.push({
      id: generateId(['notion', meta.pageId, String(chunkIndex)]),
      text: prefix + currentChunk.trim(),
      type: 'notion_page',
      metadata: {
        type: 'notion_page',
        source: 'notion',
        visibility: meta.visibility,
        pageId: meta.pageId,
        title: meta.title,
        url: meta.url,
        date: meta.lastEdited,
      }
    })
  }

  return chunks
}

function inferNotionVisibility(
  title: string,
  content: string,
): 'public_professional' | 'private_personal' | 'sensitive' {
  const combined = `${title}\n${content}`.toLowerCase()
  const sensitivePatterns = [
    'passport',
    'ssn',
    'credit card',
    'bank account',
    'medical',
    'therapy',
  ]
  if (sensitivePatterns.some((term) => combined.includes(term))) return 'sensitive'

  const personalPatterns = [
    'grocery',
    'laundry',
    'photos backup',
    'shopping',
    'relationship',
    'family',
    'personal',
    'habit tracker',
  ]
  if (personalPatterns.some((term) => combined.includes(term))) return 'private_personal'

  return 'public_professional'
}
