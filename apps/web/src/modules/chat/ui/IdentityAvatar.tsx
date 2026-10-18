import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'
import type { ChatIdentityKind } from '../domain/chat-list-model'

const SIZES = {
  list: 'h-10 w-10 text-[13px]',
  member: 'h-10 w-10 text-[13px]',
  row: 'h-8 w-8 text-xs',
  chip: 'h-6 w-6 text-[10px]',
} as const

/** Assistants and people look the same except for the face: “AI” on ink, or an initial. */
export function IdentityAvatar({
  kind,
  text,
  avatarUrl,
  size = 'row',
  className,
}: {
  kind: ChatIdentityKind
  text: string
  avatarUrl?: string | null
  size?: keyof typeof SIZES
  className?: string
}) {
  return (
    <Avatar className={cn('shrink-0 rounded-md', SIZES[size], className)} aria-hidden="true">
      {avatarUrl ? <AvatarImage src={avatarUrl} className="rounded-md object-cover" /> : null}
      <AvatarFallback
        className={cn(
          'rounded-md font-semibold',
          kind === 'assistant' ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground',
        )}
      >
        {text}
      </AvatarFallback>
    </Avatar>
  )
}
