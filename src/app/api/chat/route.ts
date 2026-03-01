import { streamText } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { retrieveContext } from '@/lib/rag/retriever'
import { buildContext } from '@/lib/rag/context-builder'
import { buildSystemPrompt } from '@/lib/rag/prompts'
import { buildGitHubTools } from '@/lib/github/tools'
import { buildNotionTools } from '@/lib/notion/tools'
import { env } from '@/lib/env'
import { evaluateQuerySafety, buildSafetyAddendum } from '@/lib/safety/policy'
import { filterChunksForProfessionalUse } from '@/lib/safety/chunk-filter'

// Vercel: allow up to 60s on Pro, 10s on free tier
export const maxDuration = 60

const messageSchema = z.object({
  role: z.enum(['user', 'assistant']),
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
    const isImplementationDeepDive =
      /\b(how\s+(did|do)\s+(you|u)\b.*\b(build|implement)|walk me through.*implementation|how is .* built|architecture of)\b/i.test(
        queryText,
      )
    const safetyDecision = evaluateQuerySafety(queryText)

    const openaiClient = createOpenAI({
      apiKey: env.OPENAI_API_KEY,
    })

    if (!safetyDecision.allow) {
      const refusalText =
        safetyDecision.userMessage ??
        'I can only answer professional and engineering-related questions in this twin.'
      const refusalResult = await streamText({
        model: openaiClient('gpt-4o-mini'),
        system:
          'You are a safety policy assistant. Reply with the provided refusal text exactly and nothing else.',
        messages: [{ role: 'user', content: refusalText }],
        temperature: 0,
        maxTokens: 120,
      })

      return refusalResult.toDataStreamResponse()
    }

    // Retrieve relevant context — query expansion + parallel search
    const retrieval = await retrieveContext(queryText, { topK: 10, minScore: 0.25 })
    const safeChunks = filterChunksForProfessionalUse(retrieval.chunks, safetyDecision)
    const safeContext = buildContext(safeChunks)
    const effectiveConfidence =
      safeChunks.length > 0
        ? retrieval.debugInfo.confidence
        : {
            level: 'low' as const,
            score: 0,
            reason: 'No professional-safe evidence available for this query.',
          }

    const lowConfidence = effectiveConfidence.level === 'low'
    const systemPrompt = [
      buildSystemPrompt('Vikramsingh Rathod', safeContext.contextText),
      buildSafetyAddendum(),
      isImplementationDeepDive
        ? `\n[Implementation Investigation Policy]\nFor implementation questions: (1) inspect repo structure, (2) run code search with multiple related terms, (3) open multiple candidate files, and only then provide a concrete explanation. Do not stop at one missing filename.`
        : '',
      lowConfidence
        ? `\n[Retrieval Confidence Advisory]\nEvidence quality is low for this query.\nBefore asserting specifics, either ask one focused clarification or use a relevant live tool call (GitHub/Notion) to verify details.`
        : '',
    ]
      .filter(Boolean)
      .join('\n')

    // Use server-side GitHub PAT — set GITHUB_TOKEN + GITHUB_LOGIN in env vars.
    // Without these the live GitHub tools fail gracefully but RAG chat still works.
    const githubToken = env.GITHUB_TOKEN ?? ''
    const githubLogin = env.GITHUB_LOGIN ?? ''
    const githubTools = buildGitHubTools(githubToken, githubLogin)
    const allowNotionTools = /\bnotion|notes|docs|research|project\b/i.test(queryText)
    
    const tools: Record<string, any> = { ...githubTools }
    if (allowNotionTools) {
      const notionTools = buildNotionTools()
      Object.assign(tools, notionTools)
    }

    const result = await streamText({
      model: openaiClient('gpt-4o', { parallelToolCalls: true }),
      system: systemPrompt,
      messages: messages.map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
      tools,
      maxSteps: isImplementationDeepDive ? 8 : 5,
      maxTokens: 2000,
      temperature: lowConfidence ? 0.3 : 0.55,
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
          query: retrieval.debugInfo.query,
          embeddingTimeMs: retrieval.debugInfo.embeddingTimeMs,
          searchTimeMs: retrieval.debugInfo.searchTimeMs,
          totalChunksSearched: retrieval.debugInfo.totalChunksSearched,
          topScores: safeChunks.slice(0, 5).map((c) => c.score),
          confidence: effectiveConfidence,
          chunks: safeContext.sources.map((source) => ({
            sourceId: source.sourceId,
            source: source.source,
            text: source.snippet ?? '',
            score: source.score,
            type: source.type,
            repo: source.repo,
            title: source.title,
            section: source.section,
            date: source.date,
            url: source.url,
          })),
          sources: safeContext.sources,
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
