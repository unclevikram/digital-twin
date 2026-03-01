'use client'

import { Tooltip } from '@/components/ui/tooltip'

interface HeaderProps {
  debugMode: boolean
  onToggleDebug: () => void
}

export function Header({ debugMode, onToggleDebug }: HeaderProps) {
  return (
    <header className="fixed top-0 left-0 right-0 z-50 h-14 border-b border-border bg-background/90 backdrop-blur-md">
      <div className="max-w-5xl mx-auto px-4 h-full flex items-center justify-between">
        {/* Logo */}
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm text-amber-400 tracking-tight">vikram.digital</span>
          <span className="text-border">·</span>
          <span className="text-xs text-muted">twin</span>
        </div>

        {/* Debug toggle */}
        <div className="flex items-center gap-3">
          <Tooltip content={debugMode ? 'Hide debug panel' : 'Show RAG debug'}>
          <button
            onClick={onToggleDebug}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-mono transition-colors ${
              debugMode
                ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                : 'text-muted hover:text-muted-foreground border border-transparent hover:border-border'
            }`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${debugMode ? 'bg-amber-400' : 'bg-muted'}`} />
            debug
          </button>
          </Tooltip>
        </div>
      </div>
    </header>
  )
}
