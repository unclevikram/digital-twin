'use client'

import { type FormEvent, type KeyboardEvent, useRef } from 'react'
import { cn } from '@/lib/utils'

interface ChatInputProps {
  value: string
  onChange: (value: string) => void
  onSubmit: (value: string) => void
  isLoading?: boolean
  disabled?: boolean
  placeholder?: string
}

export function ChatInput({
  value,
  onChange,
  onSubmit,
  isLoading,
  disabled,
  placeholder = 'Ask your digital twin anything...',
}: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    const trimmed = value.trim()
    if (!trimmed || isLoading || disabled) return
    onSubmit(trimmed)
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      const trimmed = value.trim()
      if (!trimmed || isLoading || disabled) return
      onSubmit(trimmed)
    }
  }

  const adjustHeight = () => {
    const textarea = textareaRef.current
    if (textarea) {
      textarea.style.height = 'auto'
      textarea.style.height = `${Math.min(textarea.scrollHeight, 140)}px`
    }
  }

  const canSubmit = value.trim().length > 0 && !isLoading && !disabled

  return (
    <div className="px-4 py-3 border-t border-border bg-background/90 backdrop-blur-md">
      <div className="max-w-3xl mx-auto">
        <form
          onSubmit={handleSubmit}
          className="flex items-end gap-2 rounded-xl border border-border bg-surface focus-within:border-amber-500/40 transition-colors duration-200 p-2"
        >
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => {
              onChange(e.target.value)
              adjustHeight()
            }}
            onKeyDown={handleKeyDown}
            rows={1}
            placeholder={placeholder}
            disabled={disabled}
            className={cn(
              'flex-1 resize-none bg-transparent text-sm text-white placeholder:text-muted focus:outline-none min-h-[36px] max-h-[140px] py-1.5 px-2 leading-relaxed',
              disabled && 'opacity-50 cursor-not-allowed',
            )}
          />
          <button
            type="submit"
            disabled={!canSubmit}
            className={cn(
              'shrink-0 w-8 h-8 rounded-lg flex items-center justify-center transition-all duration-150',
              canSubmit
                ? 'bg-amber-500 text-background hover:bg-amber-400 shadow-[0_0_12px_rgba(212,165,116,0.3)]'
                : 'bg-surface-2 text-muted cursor-not-allowed',
            )}
          >
            {isLoading ? (
              <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
            ) : (
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 10.5L12 3m0 0l7.5 7.5M12 3v18" />
              </svg>
            )}
          </button>
        </form>
        <p className="text-center text-[10px] text-muted mt-2">
          Press <kbd className="font-mono bg-surface-2 px-1 rounded text-muted-foreground">Enter</kbd> to send · <kbd className="font-mono bg-surface-2 px-1 rounded text-muted-foreground">Shift+Enter</kbd> for newline
        </p>
      </div>
    </div>
  )
}
