import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { getIngestionStatus } from '@/lib/ingestion/status'
import { getVectorStore } from '@/lib/vector-store'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
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
