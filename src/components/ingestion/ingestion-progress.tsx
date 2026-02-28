'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { IngestionProgress as IProgress, IngestionStats } from '@/types'

interface IngestionProgressProps {
  onComplete: (stats: IngestionStats) => void
}

const STEP_LABELS: Record<string, string> = {
  fetching: 'Fetching your GitHub data...',
  chunking: 'Building knowledge base...',
  embedding: 'Generating AI embeddings...',
  storing: 'Storing knowledge chunks...',
  complete: 'Your twin is ready!',
  error: 'Something went wrong',
}

export function IngestionProgressCard({ onComplete }: IngestionProgressProps) {
  const [progress, setProgress] = useState<IProgress>({
    status: 'idle',
    progress: 0,
    message: 'Initializing...',
  })
  const [isStarting, setIsStarting] = useState(false)
  const [pollingInterval, setPollingInterval] = useState<ReturnType<typeof setInterval> | null>(null)

  const startIngestion = async () => {
    setIsStarting(true)
    try {
      const res = await fetch('/api/ingest', { method: 'POST' })
      if (!res.ok) {
        const data = await res.json()
        setProgress({
          status: 'error',
          progress: 0,
          message: 'Failed to start ingestion',
          error: data.error ?? 'Unknown error',
        })
        return
      }
      // Begin polling
      setProgress({ status: 'fetching', progress: 2, message: 'Starting...' })
      startPolling()
    } catch {
      setProgress({
        status: 'error',
        progress: 0,
        message: 'Network error',
        error: 'Could not reach the server',
      })
    } finally {
      setIsStarting(false)
    }
  }

  const startPolling = () => {
    const interval = setInterval(async () => {
      try {
        const res = await fetch('/api/ingest/status')
        if (!res.ok) return
        const data: IProgress = await res.json()
        setProgress(data)

        if (data.status === 'complete' && data.stats) {
          clearInterval(interval)
          setPollingInterval(null)
          onComplete(data.stats)
        } else if (data.status === 'error') {
          clearInterval(interval)
          setPollingInterval(null)
        }
      } catch {
        // Silent poll failure
      }
    }, 2000)
    setPollingInterval(interval)
  }

  useEffect(() => {
    return () => {
      if (pollingInterval) clearInterval(pollingInterval)
    }
  }, [pollingInterval])

  const isRunning = ['fetching', 'chunking', 'embedding', 'storing'].includes(progress.status)

  return (
    <div className="flex items-center justify-center py-8">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>
            {progress.status === 'idle' ? (
              <>
                <span className="text-amber-400">✦</span> Set up your digital twin
              </>
            ) : (
              STEP_LABELS[progress.status] ?? 'Processing...'
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {progress.status === 'idle' && (
            <>
              <p className="text-sm text-muted-foreground leading-relaxed">
                I&apos;ll scan your GitHub repositories, commits, pull requests, and READMEs to build
                a comprehensive knowledge base — so I can answer questions as you.
              </p>
              <div className="flex flex-col gap-2 text-xs text-muted">
                <span>✓ Reads up to 30 recently active repos</span>
                <span>✓ Commits, PRs, issues, and READMEs</span>
                <span>✓ Generates AI embeddings for fast retrieval</span>
              </div>
              <Button onClick={startIngestion} loading={isStarting} className="w-full">
                Sync GitHub Data
              </Button>
            </>
          )}

          {isRunning && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">{progress.message}</p>
              {/* Progress bar */}
              <div className="h-1.5 bg-surface-3 rounded-full overflow-hidden">
                <div
                  className="h-full bg-amber-500 rounded-full transition-all duration-500"
                  style={{ width: `${progress.progress}%` }}
                />
              </div>
              <p className="text-xs text-muted text-right font-mono">{progress.progress}%</p>

              {/* Step indicators */}
              <div className="flex justify-between pt-1">
                {(['fetching', 'chunking', 'embedding', 'storing'] as const).map((step) => {
                  const steps = ['fetching', 'chunking', 'embedding', 'storing']
                  const currentIdx = steps.indexOf(progress.status)
                  const stepIdx = steps.indexOf(step)
                  const isDone = stepIdx < currentIdx
                  const isActive = stepIdx === currentIdx
                  return (
                    <div
                      key={step}
                      className={`flex flex-col items-center gap-1 text-[10px] ${
                        isActive ? 'text-amber-400' : isDone ? 'text-green-400' : 'text-muted'
                      }`}
                    >
                      <span
                        className={`w-2 h-2 rounded-full ${
                          isActive ? 'bg-amber-400 animate-pulse' : isDone ? 'bg-green-400' : 'bg-surface-3'
                        }`}
                      />
                      <span className="capitalize">{step}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {progress.status === 'error' && (
            <div className="space-y-3">
              <div className="rounded-lg bg-red-900/20 border border-red-900/30 px-3 py-2.5">
                <p className="text-sm text-red-400">{progress.error ?? 'An error occurred'}</p>
              </div>
              <Button variant="secondary" onClick={startIngestion} loading={isStarting} className="w-full">
                Try Again
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
