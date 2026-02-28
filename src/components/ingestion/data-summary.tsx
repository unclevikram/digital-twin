import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import type { IngestionStats } from '@/types'

interface DataSummaryProps {
  stats: IngestionStats
  onDismiss?: () => void
}

export function DataSummary({ stats, onDismiss }: DataSummaryProps) {
  return (
    <Card className="w-full max-w-md border-green-900/30">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <span className="text-green-400">✓</span> Twin ready
          </CardTitle>
          {onDismiss && (
            <button
              onClick={onDismiss}
              className="text-muted hover:text-muted-foreground transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <StatCard label="Repos" value={stats.totalRepos} />
          <StatCard label="Commits" value={stats.totalCommits} />
          <StatCard label="Pull Requests" value={stats.totalPRs} />
          <StatCard label="Issues" value={stats.totalIssues} />
        </div>
        <div className="flex items-center justify-between pt-1">
          <span className="text-xs text-muted">{stats.totalChunks} knowledge chunks indexed</span>
          <Badge variant="green">Active</Badge>
        </div>
        {onDismiss && (
          <p className="text-xs text-muted-foreground text-center pt-1">
            Try asking something below ↓
          </p>
        )}
      </CardContent>
    </Card>
  )
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-surface-2 rounded-lg p-3 text-center">
      <p className="text-lg font-mono font-semibold text-white">{value}</p>
      <p className="text-[10px] text-muted uppercase tracking-wider mt-0.5">{label}</p>
    </div>
  )
}
