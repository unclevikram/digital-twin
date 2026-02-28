import { UserAvatar } from '@/components/auth/user-avatar'

interface TypingIndicatorProps {
  avatarSrc?: string | null
  name?: string | null
}

export function TypingIndicator({ avatarSrc, name }: TypingIndicatorProps) {
  return (
    <div className="flex items-start gap-3 animate-fade-slide-in">
      <UserAvatar src={avatarSrc} name={name} size="sm" showAiBadge />
      <div className="rounded-2xl rounded-tl-sm bg-surface border border-border px-4 py-3">
        <div className="flex gap-1 items-center h-4">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse-dot"
              style={{ animationDelay: `${i * 0.16}s` }}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
