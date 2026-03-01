import { streamText } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { retrieveContext } from '@/lib/rag/retriever'
import { buildSystemPrompt } from '@/lib/rag/prompts'
import { buildGitHubTools } from '@/lib/github/tools'
import { buildNotionTools } from '@/lib/notion/tools'

// Vercel: allow up to 60s on Pro, 10s on free tier
export const maxDuration = 60

const messageSchema = z.object({
  role: z.enum(['user', 'assistant', 'system']),
  // Allow empty string — assistant messages from tool-calling steps have content: ""
  // with the actual payload in toolInvocations, not the text content field.
  content: z.string(),
})

const requestSchema = z.object({
  messages: z.array(messageSchema).min(1),
})

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const parsed = requestSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.flatten() },
        { status: 400 },
      )
    }

    const { messages } = parsed.data

    // Extract the last user message for context retrieval
    const lastUserMessage = [...messages].reverse().find((m) => m.role === 'user')
    const queryText = lastUserMessage?.content ?? ''

    // Retrieve relevant context — query expansion + parallel search
    const retrieval = await retrieveContext(queryText, { topK: 10, minScore: 0.25 })

    const systemPrompt = buildSystemPrompt('Vikramsingh Rathod', retrieval.contextText)

    const openaiClient = createOpenAI({
      apiKey: process.env.OPENAI_API_KEY!,
    })

    const githubToken = process.env.GITHUB_TOKEN!
    const githubLogin = process.env.GITHUB_OWNER_LOGIN!
    const githubTools = buildGitHubTools(githubToken, githubLogin)
    const notionTools = buildNotionTools()

    const result = await streamText({
      model: openaiClient('gpt-4o', { parallelToolCalls: true }),
      system: systemPrompt,
      messages: messages.map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
      tools: { ...githubTools, ...notionTools },
      maxSteps: 5,
      maxTokens: 2000,
      temperature: 0.6,
    })

    // Stream the response with debug info in headers
    const response = result.toDataStreamResponse()

    // Attach debug info as a custom header so the frontend debug panel can use it
    const headers = new Headers(response.headers)
    // encodeURIComponent ensures non-ASCII chars (e.g. • from READMEs) are safe in headers
    headers.set(
      'X-Retrieval-Debug',
      encodeURIComponent(
        JSON.stringify({
          embeddingTimeMs: retrieval.debugInfo.embeddingTimeMs,
          searchTimeMs: retrieval.debugInfo.searchTimeMs,
          totalChunksSearched: retrieval.debugInfo.totalChunksSearched,
          topScores: retrieval.debugInfo.topScores,
          chunks: retrieval.debugInfo.chunks,
          expandedQueries: retrieval.debugInfo.expandedQueries,
        }),
      ),
    )

    return new Response(response.body, {
      status: response.status,
      headers,
    })
  } catch (err) {
    console.error('[Chat API] Error:', err)
    return NextResponse.json(
      { error: 'Internal server error. Please try again.' },
      { status: 500 },
    )
  }
}
