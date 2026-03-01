import { Client } from '@notionhq/client'
import { env } from '@/lib/env'

export const notionClient = new Client({
  auth: env.NOTION_API_KEY,
})
