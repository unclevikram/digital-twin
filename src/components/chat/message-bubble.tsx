'use client'

import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { UserAvatar } from '@/components/auth/user-avatar'
import { SourcePanel } from './source-panel'
import type { Message } from '@/types'
import { cn } from '@/lib/utils'

interface MessageBubbleProps {
  message: Message
  twinAvatarSrc?: string | null
  twinName?: string | null
  userAvatarSrc?: string | null
}

export function MessageBubble({
  message,
  twinAvatarSrc,
  twinName,
  userAvatarSrc,
}: MessageBubbleProps) {
  const isUser = message.role === 'user'

  if (isUser) {
    return (
      <div className="flex justify-end animate-fade-slide-in">
        <div className="max-w-[70%] flex items-end gap-2">
          <div className="rounded-2xl rounded-br-sm bg-amber-500 px-4 py-2.5 text-sm text-background">
            <p className="whitespace-pre-wrap break-words leading-relaxed">{message.content}</p>
          </div>
          <UserAvatar src={userAvatarSrc} name="You" size="sm" className="shrink-0 mb-0.5" />
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-start gap-3 max-w-[85%] animate-fade-slide-in">
      <UserAvatar src={twinAvatarSrc} name={twinName} size="sm" showAiBadge className="mt-0.5 shrink-0" />
      <div
        className={cn(
          'rounded-2xl rounded-tl-sm bg-surface border border-border px-4 py-3 text-sm text-white/90',
          'flex-1',
        )}
      >
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            p: ({ children }) => (
              <p className="mb-2 last:mb-0 leading-relaxed">{children}</p>
            ),
            code: ({ children, className }) => {
              const isInline = !className
              return isInline ? (
                <code className="bg-surface-2 text-amber-300 px-1.5 py-0.5 rounded text-xs font-mono">
                  {children}
                </code>
              ) : (
                <code className="block bg-surface-2 text-amber-100 p-3 rounded-lg text-xs font-mono overflow-x-auto my-2 border border-border">
                  {children}
                </code>
              )
            },
            pre: ({ children }) => <>{children}</>,
            strong: ({ children }) => (
              <strong className="font-semibold text-white">{children}</strong>
            ),
            ul: ({ children }) => (
              <ul className="list-disc list-inside space-y-0.5 mb-2 text-white/80">{children}</ul>
            ),
            ol: ({ children }) => (
              <ol className="list-decimal list-inside space-y-0.5 mb-2 text-white/80">{children}</ol>
            ),
            li: ({ children }) => <li className="text-sm">{children}</li>,
            a: ({ href, children }) => (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-amber-400 hover:underline"
              >
                {children}
              </a>
            ),
            h1: ({ children }) => (
              <h1 className="text-base font-semibold text-white mb-2">{children}</h1>
            ),
            h2: ({ children }) => (
              <h2 className="text-sm font-semibold text-white mb-1.5">{children}</h2>
            ),
            h3: ({ children }) => (
              <h3 className="text-sm font-medium text-white/90 mb-1">{children}</h3>
            ),
          }}
        >
          {message.content}
        </ReactMarkdown>

        {message.sources && message.sources.length > 0 && (
          <SourcePanel sources={message.sources} />
        )}
      </div>
    </div>
  )
}
