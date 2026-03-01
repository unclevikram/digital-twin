'use client'

import { useEffect, useRef, useState } from 'react'
import { useChat } from '@ai-sdk/react'
import { MessageBubble } from './message-bubble'
import { ChatInput } from './chat-input'
import { TypingIndicator } from './typing-indicator'
import { IngestionProgressCard } from '@/components/ingestion/ingestion-progress'
import { DataSummary } from '@/components/ingestion/data-summary'
import type { Message, IngestionStats, RetrievalDebugInfo, ChunkSource } from '@/types'
import { SUGGESTED_QUESTIONS } from '@/lib/rag/prompts'

interface ChatContainerProps {
  onDebugInfo: (info: RetrievalDebugInfo) => void
  debugMode: boolean
}

type SetupState = 'checking' | 'needs_setup' | 'ready' | 'show_summary'

export function ChatContainer({ onDebugInfo }: ChatContainerProps) {
  const [setupState, setSetupState] = useState<SetupState>('checking')
  const [ingestionStats, setIngestionStats] = useState<IngestionStats | null>(null)
  const [inputValue, setInputValue] = useState('')
  // Track per-message debug info and sources (keyed by message ID index)
  const debugInfoRef = useRef<Map<string, RetrievalDebugInfo>>(new Map())
  const sourcesRef = useRef<Map<string, ChunkSource[]>>(new Map())
  const pendingDebugRef = useRef<RetrievalDebugInfo | null>(null)
  const pendingSourcesRef = useRef<ChunkSource[] | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const prevMsgCountRef = useRef(0)

  const { messages, append, isLoading, error } = useChat({
    api: '/api/chat',
    onResponse: (response) => {
      // Extract retrieval debug info from response headers
      const debugHeader = response.headers.get('X-Retrieval-Debug')
      if (debugHeader) {
        try {
          const debug = JSON.parse(decodeURIComponent(debugHeader)) as RetrievalDebugInfo & {
            chunks: Array<{
              sourceId: string
              source: 'github' | 'notion'
              text: string
              score: number
              type: string
              repo?: string
              title?: string
              section?: string
              date?: string
              url?: string
            }>
            sources?: ChunkSource[]
          }
          // Will be associated with the next assistant message
          const debugInfo: RetrievalDebugInfo = {
            query: debug.query ?? '',
            expandedQueries: debug.expandedQueries,
            embeddingTimeMs: debug.embeddingTimeMs,
            searchTimeMs: debug.searchTimeMs,
            totalChunksSearched: debug.totalChunksSearched,
            topScores: debug.topScores,
            confidence: debug.confidence,
            chunks: debug.chunks,
          }
          onDebugInfo(debugInfo)
          pendingDebugRef.current = debugInfo
          pendingSourcesRef.current = debug.sources ?? []
        } catch {
          // Ignore parse errors
        }
      }
    },
  })

  // Associate pending retrieval debug/sources with the next assistant message.
  useEffect(() => {
    if (!pendingDebugRef.current) return

    const latestAssistant = [...messages]
      .reverse()
      .find((m) => m.role === 'assistant' && m.content.trim().length > 0)
    if (!latestAssistant) return

    if (!debugInfoRef.current.has(latestAssistant.id)) {
      debugInfoRef.current.set(latestAssistant.id, pendingDebugRef.current)
      if (pendingSourcesRef.current) {
        sourcesRef.current.set(latestAssistant.id, pendingSourcesRef.current)
      }
      pendingDebugRef.current = null
      pendingSourcesRef.current = null
    }
  }, [messages])

  // Check ingestion status on mount
  useEffect(() => {
    async function checkStatus() {
      try {
        const res = await fetch('/api/ingest/status')
        if (!res.ok) {
          setSetupState('needs_setup')
          return
        }
        const data = await res.json()
        if (data.status === 'complete' || (data.vectorStats?.totalChunks > 0)) {
          setSetupState('ready')
        } else {
          setSetupState('needs_setup')
        }
      } catch {
        setSetupState('needs_setup')
      }
    }
    checkStatus()
  }, [])

  // Auto-scroll to bottom. Use 'smooth' only on new message append;
  // use 'instant' during streaming so competing animations don't bounce.
  useEffect(() => {
    const isNewMessage = messages.length !== prevMsgCountRef.current
    prevMsgCountRef.current = messages.length
    messagesEndRef.current?.scrollIntoView({
      behavior: isNewMessage ? 'smooth' : 'instant',
    })
  }, [messages, isLoading])

  const handleSubmit = async (text: string) => {
    if (!text.trim()) return
    setInputValue('')
    await append({ role: 'user', content: text })
  }

  const handleSuggestedQuestion = (q: string) => {
    handleSubmit(q)
  }

  const handleIngestionComplete = (stats: IngestionStats) => {
    setIngestionStats(stats)
    setSetupState('show_summary')
  }

  // Convert SDK messages to our typed Message with sources/debug attached.
  // Skip assistant messages with no content yet (tool-calling phase produces an
  // empty message shell before the final text response starts streaming).
  const typedMessages: Message[] = messages
    .filter((m) => m.role !== 'assistant' || m.content.trim().length > 0)
    .map((m) => ({
      id: m.id,
      role: m.role as 'user' | 'assistant',
      content: m.content,
      createdAt: m.createdAt,
      sources: sourcesRef.current.get(m.id),
      debugInfo: debugInfoRef.current.get(m.id),
    }))

  const showSuggestions = messages.length === 0 && setupState === 'ready'

  return (
    <div className="flex flex-col h-full">
      {/* Scrollable chat area */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
          {/* Setup states */}
          {setupState === 'checking' && (
            <div className="flex justify-center py-12">
              <div className="flex items-center gap-2 text-sm text-muted">
                <span className="w-4 h-4 border-2 border-amber-500/40 border-t-amber-500 rounded-full animate-spin" />
                Loading...
              </div>
            </div>
          )}

          {setupState === 'needs_setup' && (
            <IngestionProgressCard onComplete={handleIngestionComplete} />
          )}

          {setupState === 'show_summary' && ingestionStats && (
            <div className="flex justify-center">
              <DataSummary
                stats={ingestionStats}
                onDismiss={() => setSetupState('ready')}
              />
            </div>
          )}

          {/* Suggested questions */}
          {showSuggestions && (
            <div className="flex flex-col items-center gap-4 py-8">
              <p className="text-sm text-muted-foreground">Ask your digital twin anything:</p>
              <div className="flex flex-wrap justify-center gap-2">
                {SUGGESTED_QUESTIONS.map((q) => (
                  <button
                    key={q}
                    onClick={() => handleSuggestedQuestion(q)}
                    className="text-sm px-4 py-2 rounded-full border border-border bg-surface hover:border-amber-500/40 hover:bg-surface-2 text-muted-foreground hover:text-white transition-all duration-150"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Messages */}
          {typedMessages.map((message) => (
            <MessageBubble
              key={message.id}
              message={message}
              twinName="Vikramsingh Rathod"
            />
          ))}

          {/* Typing indicator */}
          {isLoading && (
            <TypingIndicator
              name="Vikramsingh Rathod"
            />
          )}

          {/* Error state */}
          {error && (
            <div className="flex justify-start max-w-[80%]">
              <div className="rounded-2xl rounded-tl-sm bg-red-900/20 border border-red-900/30 px-4 py-3 text-sm text-red-400">
                I&apos;m having trouble thinking right now. Please try again in a moment.
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Fixed input bar */}
      {(setupState === 'ready' || setupState === 'show_summary' || messages.length > 0) && (
        <ChatInput
          value={inputValue}
          onChange={setInputValue}
          onSubmit={handleSubmit}
          isLoading={isLoading}
          disabled={setupState === 'needs_setup'}
        />
      )}
    </div>
  )
}
