'use client'

import { cn } from '@/lib/utils'
import type { RetrievalDebugInfo } from '@/types'

interface DebugPanelProps {
  debugInfo: RetrievalDebugInfo | null
  visible: boolean
}

export function DebugPanel({ debugInfo, visible }: DebugPanelProps) {
  return (
    <aside
      className={cn(
        'fixed right-0 top-14 bottom-0 w-80 border-l border-border bg-surface overflow-y-auto',
        'transition-transform duration-300',
        visible ? 'translate-x-0' : 'translate-x-full',
        'z-40',
      )}
    >
      <div className="p-4 border-b border-border">
        <h3 className="text-xs font-mono text-amber-400 uppercase tracking-wider">RAG Debug</h3>
        <p className="text-xs text-muted mt-0.5">Retrieval transparency for last query</p>
      </div>

      {!debugInfo ? (
        <div className="p-4 text-xs text-muted font-mono">
          No query yet. Ask a question to see retrieval details.
        </div>
      ) : (
        <div className="p-4 space-y-4">
          {/* Query */}
          <Section title="Query">
            <p className="text-xs text-white/80 bg-surface-2 rounded p-2 font-mono break-words">
              &quot;{debugInfo.query}&quot;
            </p>
            {debugInfo.expandedQueries && debugInfo.expandedQueries.length > 0 && (
              <div className="mt-1.5 space-y-1">
                <p className="text-[10px] text-muted uppercase tracking-widest">Also searched</p>
                {debugInfo.expandedQueries.map((q, i) => (
                  <p key={i} className="text-xs text-white/50 bg-surface-2 rounded p-1.5 font-mono break-words">
                    &quot;{q}&quot;
                  </p>
                ))}
              </div>
            )}
          </Section>

          {/* Timing */}
          <Section title="Timing">
            <div className="space-y-1 font-mono">
              <TimingRow label="Embedding" ms={debugInfo.embeddingTimeMs} />
              <TimingRow label="Vector search" ms={debugInfo.searchTimeMs} />
              <TimingRow
                label="Total retrieval"
                ms={debugInfo.embeddingTimeMs + debugInfo.searchTimeMs}
                highlight
              />
            </div>
          </Section>

          {/* Stats */}
          <Section title="Stats">
            <div className="text-xs text-muted-foreground font-mono space-y-0.5">
              <p>Chunks searched: {debugInfo.totalChunksSearched}</p>
              <p>Chunks returned: {debugInfo.chunks.length}</p>
              <p>
                Confidence: {debugInfo.confidence.level} ({debugInfo.confidence.score.toFixed(2)})
              </p>
              {debugInfo.topScores && debugInfo.topScores.length > 0 && (
                <p>Top raw scores: {debugInfo.topScores.map(s => s.toFixed(3)).join(', ')}</p>
              )}
              {debugInfo.totalChunksSearched === 0 && (
                <p className="text-red-400">⚠ Search returned 0 results (index error?)</p>
              )}
            </div>
          </Section>

          {/* Top chunks */}
          <Section title={`Retrieved Chunks (${debugInfo.chunks.length})`}>
            <div className="space-y-3">
              {debugInfo.chunks.map((chunk, i) => (
                <div key={i} className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono text-muted-foreground">
                      {chunk.type}{chunk.repo ? ` · ${chunk.repo}` : ''}
                    </span>
                    <ScoreBar score={chunk.score} />
                  </div>
                  <p className="text-xs text-white/60 bg-surface-2 rounded p-2 leading-relaxed line-clamp-3">
                    {chunk.text}
                  </p>
                </div>
              ))}
            </div>
          </Section>
        </div>
      )}
    </aside>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <h4 className="text-[10px] font-mono text-muted uppercase tracking-widest">{title}</h4>
      {children}
    </div>
  )
}

function TimingRow({
  label,
  ms,
  highlight,
}: {
  label: string
  ms: number
  highlight?: boolean
}) {
  return (
    <div className={cn('flex justify-between text-xs', highlight ? 'text-amber-400' : 'text-muted-foreground')}>
      <span>{label}</span>
      <span>{ms}ms</span>
    </div>
  )
}

function ScoreBar({ score }: { score: number }) {
  const color =
    score >= 0.7 ? 'bg-green-400' : score >= 0.5 ? 'bg-amber-400' : 'bg-red-400'
  const width = `${Math.round(score * 100)}%`

  return (
    <div className="flex items-center gap-1.5">
      <span className={cn('text-[10px] font-mono', score >= 0.7 ? 'text-green-400' : score >= 0.5 ? 'text-amber-400' : 'text-red-400')}>
        {score.toFixed(2)}
      </span>
      <div className="w-16 h-1.5 bg-surface-3 rounded-full overflow-hidden">
        <div className={cn('h-full rounded-full', color)} style={{ width }} />
      </div>
    </div>
  )
}
