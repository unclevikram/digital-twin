import { type HTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'amber' | 'green' | 'red' | 'blue' | 'outline'
}

export function Badge({ className, variant = 'default', ...props }: BadgeProps) {
  const variants = {
    default: 'bg-surface-2 text-muted-foreground border border-border',
    amber: 'bg-amber-500/10 text-amber-400 border border-amber-500/20',
    green: 'bg-green-900/20 text-green-400 border border-green-900/30',
    red: 'bg-red-900/20 text-red-400 border border-red-900/30',
    blue: 'bg-blue-900/20 text-blue-400 border border-blue-900/30',
    outline: 'bg-transparent text-muted-foreground border border-border',
  }

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium',
        variants[variant],
        className,
      )}
      {...props}
    />
  )
}
