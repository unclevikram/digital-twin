import { notionClient } from './client'
import { NotionToMarkdown } from 'notion-to-md'
import { generateId, estimateTokens } from '@/lib/utils'
import type { DataChunk } from '@/types'

const n2m = new NotionToMarkdown({ notionClient })

const MAX_TOKENS = 500
const OVERLAP_TOKENS = 50

export async function fetchAndChunkNotionPages(): Promise<DataChunk[]> {
  if (!process.env.NOTION_API_KEY) {
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

    const mdBlocks = await n2m.pageToMarkdown(pageId)
    const mdString = n2m.toMarkdownString(mdBlocks)
    
    if (!mdString.parent.trim()) continue

    const pageChunks = chunkNotionContent(mdString.parent, {
      pageId,
      title,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      url: (page as any).url,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      lastEdited: (page as any).last_edited_time,
    })

    chunks.push(...pageChunks)
  }

  return chunks
}

function chunkNotionContent(
  content: string,
  meta: { pageId: string; title: string; url: string; lastEdited: string }
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
        pageId: meta.pageId,
        title: meta.title,
        url: meta.url,
        date: meta.lastEdited,
      }
    })
  }

  return chunks
}
