import { tool } from 'ai'
import { z } from 'zod'
import { notionClient } from './client'
import { NotionToMarkdown } from 'notion-to-md'

const n2m = new NotionToMarkdown({ notionClient })

export function buildNotionTools() {
  if (!process.env.NOTION_API_KEY) {
    return {}
  }

  return {
    fetchNotionPages: tool({
      description: `Fetches a list of accessible Notion pages. Use this when asked to "check Notion", "list notes", or see what is in the Notion workspace.`,
      parameters: z.object({
        query: z.string().optional().describe('Optional search query to filter pages'),
      }),
      execute: async ({ query }) => {
        try {
          const response = await notionClient.search({
            query,
            filter: {
              value: 'page',
              property: 'object',
            },
            sort: {
              direction: 'descending',
              timestamp: 'last_edited_time',
            },
            page_size: 10,
          })

          if (response.results.length === 0) {
            return 'No Notion pages found. (Note: Pages must be explicitly shared with the integration)'
          }

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const pages = response.results.map((page: any) => {
            if (!('properties' in page)) return null
            const titleProp = page.properties.title || page.properties.Name
            const title = titleProp?.title?.[0]?.plain_text ?? 'Untitled'
            return `- ${title} (ID: ${page.id})`
          }).filter(Boolean)

          return `Found ${pages.length} Notion pages:\n${pages.join('\n')}`
        } catch (err) {
          return `Failed to fetch Notion pages: ${err}`
        }
      },
    }),
    
    readNotionPage: tool({
      description: `Reads the content of a specific Notion page. Use this when asked about the details of a note, task, or project document.`,
      parameters: z.object({
        pageId: z.string().describe('The ID of the page to read'),
      }),
      execute: async ({ pageId }) => {
        try {
            const mdblocks = await n2m.pageToMarkdown(pageId)
            const mdString = n2m.toMarkdownString(mdblocks)
            
            return `Page Content:\n${mdString.parent.slice(0, 5000)}`
        } catch (err) {
            return `Failed to read Notion page: ${err}`
        }
      }
    })
  }
}
