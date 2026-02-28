import Image from 'next/image'
import { cn } from '@/lib/utils'

interface UserAvatarProps {
  src?: string | null
  name?: string | null
  size?: 'sm' | 'md' | 'lg'
  showAiBadge?: boolean
  className?: string
}

const sizes = { sm: 32, md: 40, lg: 56 }
const sizeClasses = { sm: 'w-8 h-8', md: 'w-10 h-10', lg: 'w-14 h-14' }

export function UserAvatar({
  src,
  name,
  size = 'md',
  showAiBadge = false,
  className,
}: UserAvatarProps) {
  const px = sizes[size]
  const initials = name
    ? name
        .split(' ')
        .map((n) => n[0])
        .join('')
        .slice(0, 2)
        .toUpperCase()
    : 'VR'

  return (
    <span className={cn('relative inline-block shrink-0', sizeClasses[size], className)}>
      {src ? (
        <Image
          src={src}
          alt={name ?? 'User avatar'}
          width={px}
          height={px}
          className={cn('rounded-full object-cover', sizeClasses[size])}
        />
      ) : (
        <span
          className={cn(
            'flex items-center justify-center rounded-full bg-amber-500/20 text-amber-400 font-mono font-semibold',
            sizeClasses[size],
            size === 'sm' ? 'text-xs' : 'text-sm',
          )}
        >
          {initials}
        </span>
      )}
      {showAiBadge && (
        <span className="absolute -bottom-0.5 -right-0.5 bg-amber-500 text-background text-[8px] font-bold px-1 rounded-full leading-tight">
          AI
        </span>
      )}
    </span>
  )
}
