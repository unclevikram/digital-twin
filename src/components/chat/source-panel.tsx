'use client'

import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import type { ChunkSource } from '@/types'

interface SourcePanelProps {
  sources: ChunkSource[]
}

export function SourcePanel({ sources }: SourcePanelProps) {
  const [expanded, setExpanded] = useState(false)

  if (!sources || sources.length === 0) return null

  return (
    <div className="mt-2 pt-2 border-t border-border/50">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 text-xs text-muted hover:text-muted-foreground transition-colors"
      >
        <svg
          className={`w-3 h-3 transition-transform ${expanded ? 'rotate-90' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
        <span>{sources.length} source{sources.length !== 1 ? 's' : ''}</span>
      </button>

      {expanded && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {sources.map((source, i) => (
            <SourceBadge key={i} source={source} />
          ))}
        </div>
      )}
    </div>
  )
}

function SourceBadge({ source }: { source: ChunkSource }) {
  const label = [
    source.repo,
    source.type.replace('_', ' '),
    source.date ? new Date(source.date).getFullYear() : '',
  ]
    .filter(Boolean)
    .join('/')

  const variant =
    source.score >= 0.7 ? 'green' : source.score >= 0.5 ? 'amber' : 'default'

  return (
    <Badge variant={variant} className="cursor-default">
      {source.url ? (
        <a
          href={source.url}
          target="_blank"
          rel="noopener noreferrer"
          className="hover:underline"
          onClick={(e) => e.stopPropagation()}
        >
          {label}
        </a>
      ) : (
        label
      )}
    </Badge>
  )
}
