import { config } from 'dotenv'
import { Client } from '@notionhq/client'
import { NotionToMarkdown } from 'notion-to-md'

// Load environment variables
config({ path: '.env.local' })

async function testNotion() {
  const apiKey = process.env.NOTION_API_KEY
  if (!apiKey) {
    console.error('❌ NOTION_API_KEY is missing in .env.local')
    return
  }

  console.log('🔑 Found NOTION_API_KEY:', apiKey.slice(0, 4) + '...')

  const notion = new Client({ auth: apiKey })
  const n2m = new NotionToMarkdown({ notionClient: notion })

  try {
    console.log('📡 Connecting to Notion...')
    const response = await notion.search({
      filter: {
        value: 'page',
        property: 'object',
      },
      sort: {
        direction: 'descending',
        timestamp: 'last_edited_time',
      },
      page_size: 5,
    })

    console.log(`✅ Connection successful! Found ${response.results.length} pages.`)

    if (response.results.length === 0) {
      console.warn('⚠️ No pages found. Make sure you have shared pages with the integration.')
      return
    }

    for (const page of response.results) {
      if (!('properties' in page)) continue
      
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const titleProp = (page as any).properties.title || (page as any).properties.Name
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const title = titleProp?.title?.[0]?.plain_text ?? 'Untitled'
      
      console.log(`\n📄 Page: ${title} (${page.id})`)
      
      const mdblocks = await n2m.pageToMarkdown(page.id)
      const mdString = n2m.toMarkdownString(mdblocks)
      console.log(`   Content preview: ${mdString.parent.slice(0, 100).replace(/\n/g, ' ')}...`)
    }

  } catch (error) {
    console.error('❌ Notion API Error:', error)
  }
}

testNotion()
