import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { runIngestionPipeline } from '@/lib/ingestion/pipeline'
import { getIngestionStatus, setIngestionStatus } from '@/lib/ingestion/status'

export const maxDuration = 60

export async function POST(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user || !session.accessToken) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const userId = session.user.email ?? session.user.name ?? 'default'
    const currentStatus = getIngestionStatus(userId)

    // Prevent duplicate ingestion runs
    if (
      currentStatus.status === 'fetching' ||
      currentStatus.status === 'chunking' ||
      currentStatus.status === 'embedding' ||
      currentStatus.status === 'storing'
    ) {
      return NextResponse.json(
        { status: 'already_running', message: 'Ingestion is already in progress' },
        { status: 409 },
      )
    }

    const accessToken = session.accessToken

    // Fire-and-forget — do NOT await the pipeline (Vercel timeout prevention)
    // Status is tracked via in-memory map and polled by the frontend
    setIngestionStatus(userId, {
      status: 'fetching',
      progress: 0,
      message: 'Starting ingestion...',
      startedAt: new Date().toISOString(),
    })

    runIngestionPipeline(accessToken, userId).catch((err) => {
      console.error('[Ingest API] Pipeline error:', err)
      setIngestionStatus(userId, {
        status: 'error',
        progress: 0,
        message: 'Ingestion failed unexpectedly',
        error: err instanceof Error ? err.message : 'Unknown error',
      })
    })

    return NextResponse.json({ status: 'started', message: 'Ingestion pipeline started' })
  } catch (err) {
    console.error('[Ingest API] Error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
