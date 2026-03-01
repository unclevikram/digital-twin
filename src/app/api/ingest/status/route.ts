import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { getIngestionStatus } from '@/lib/ingestion/status'
import { getVectorStore } from '@/lib/vector-store'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const session = await auth()
    if (!session?.user) {
      // In production, the IngestionButton polls this endpoint.
      // If the user's session expires or is invalid, return 200 with "idle" status
      // instead of 401 to prevent console errors.
      return NextResponse.json({ status: 'idle', progress: 0, message: 'Not logged in' })
    }

    const userId = session.user.email ?? session.user.name ?? 'default'
    const status = getIngestionStatus(userId)

    // If idle, check if there's already data in the vector store
    if (status.status === 'idle') {
      try {
        const vectorStore = getVectorStore()
        const stats = await vectorStore.getStats()
        if (stats.totalChunks > 0) {
          return NextResponse.json({
            ...status,
            status: 'complete',
            progress: 100,
            message: `Knowledge base ready with ${stats.totalChunks} chunks`,
            vectorStats: stats,
          })
        }
      } catch {
        // Vector store not initialized yet — that's fine
      }
    }

    return NextResponse.json(status)
  } catch (err) {
    console.error('[Ingest Status API] Error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
