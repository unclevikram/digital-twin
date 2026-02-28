'use client'

import { type ButtonHTMLAttributes, forwardRef } from 'react'
import { cn } from '@/lib/utils'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', loading, children, disabled, ...props }, ref) => {
    const baseStyles =
      'inline-flex items-center justify-center gap-2 font-medium transition-all duration-150 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/50 disabled:opacity-50 disabled:cursor-not-allowed select-none'

    const variants = {
      primary:
        'bg-amber-500 text-background hover:bg-amber-400 active:bg-amber-600 shadow-[0_0_20px_rgba(212,165,116,0.2)] hover:shadow-[0_0_25px_rgba(212,165,116,0.35)]',
      secondary:
        'bg-surface-2 text-white border border-border hover:border-amber-500/40 hover:bg-surface-3 active:bg-surface',
      ghost:
        'text-muted-foreground hover:text-white hover:bg-surface-2 active:bg-surface',
      danger: 'bg-red-900/20 text-red-400 border border-red-900/40 hover:bg-red-900/30',
    }

    const sizes = {
      sm: 'px-3 py-1.5 text-xs h-8',
      md: 'px-4 py-2 text-sm h-9',
      lg: 'px-6 py-2.5 text-sm h-11',
    }

    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={cn(baseStyles, variants[variant], sizes[size], className)}
        {...props}
      >
        {loading && (
          <span className="inline-block w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
        )}
        {children}
      </button>
    )
  },
)

Button.displayName = 'Button'
