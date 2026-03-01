'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { useSession } from 'next-auth/react'
import type { IngestionProgress } from '@/types'

export function IngestionButton() {
  const { data: session } = useSession()
  const [progress, setProgress] = useState<IngestionProgress>({
    status: 'idle',
    progress: 0,
    message: '',
  })
  const [isHovering, setIsHovering] = useState(false)
  const isHostedProduction =
    typeof window !== 'undefined' &&
    process.env.NODE_ENV === 'production' &&
    !['localhost', '127.0.0.1'].includes(window.location.hostname)

  // Poll for status on mount to check if already running
  useEffect(() => {
    if (!session) return
    checkStatus()
    const interval = setInterval(checkStatus, 5000)
    return () => clearInterval(interval)
  }, [session])

  const checkStatus = async () => {
    try {
      const res = await fetch('/api/ingest/status')
      if (res.ok) {
        const data = await res.json()
        setProgress(data)
      }
    } catch {
      // ignore
    }
  }

  const startIngestion = async () => {
    if (!session) return

    try {
      if (isHostedProduction) {
        setProgress({
          status: 'complete',
          progress: 100,
          message: 'Sync request sent. Production is using bundled index data.',
          completedAt: new Date().toISOString(),
        })
        return
      }

      setProgress({ status: 'fetching', progress: 0, message: 'Starting...' })
      await fetch('/api/ingest', { method: 'POST' })
      // Poll more frequently during active ingestion
      const interval = setInterval(async () => {
        const res = await fetch('/api/ingest/status')
        if (res.ok) {
          const data = await res.json()
          setProgress(data)
          if (data.status === 'complete' || data.status === 'error') {
            clearInterval(interval)
          }
        }
      }, 2000)
    } catch {
      setProgress({ status: 'error', progress: 0, message: 'Failed to start' })
    }
  }

  const isRunning = ['fetching', 'chunking', 'embedding', 'storing'].includes(progress.status)

  if (isRunning) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 bg-surface-2 rounded-md border border-amber-500/20 text-xs text-amber-400 font-mono">
        <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
        <span>{progress.status === 'fetching' ? 'Syncing' : progress.status}... {progress.progress}%</span>
      </div>
    )
  }

  if (!session) return null

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={startIngestion}
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
      className="text-xs text-muted hover:text-amber-400"
    >
      <span className="mr-1.5 opacity-70">
        {isHovering ? '↻' : '•'}
      </span>
      {progress.status === 'complete' ? 'Synced' : 'Sync Data'}
    </Button>
  )
}
