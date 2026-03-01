import { NextResponse } from 'next/server'
import { getVectorStore } from '@/lib/vector-store'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const vectorStore = getVectorStore()
    const stats = await vectorStore.getStats()
    if (stats.totalChunks > 0) {
      return NextResponse.json({
        status: 'complete',
        progress: 100,
        message: `Knowledge base ready with ${stats.totalChunks} chunks`,
        vectorStats: stats,
      })
    }
    return NextResponse.json({ status: 'idle', progress: 0, message: 'No data synced yet' })
  } catch {
    return NextResponse.json({ status: 'idle', progress: 0, message: 'No data synced yet' })
  }
}
