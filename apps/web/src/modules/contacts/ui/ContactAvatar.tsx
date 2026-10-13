import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'

export interface ContactAvatarProps {
  name: string
  src?: string | null
  /** Assistants differ from people only by their avatar: an ink "AI" tile. */
  isAssistant?: boolean
  /** Someone else's assistant uses the light variant. */
  isOthersAssistant?: boolean
  className?: string
  fallbackClassName?: string
}

export function ContactAvatar({
  name,
  src,
  isAssistant = false,
  isOthersAssistant = false,
  className,
  fallbackClassName,
}: ContactAvatarProps) {
  return (
    <Avatar className={cn('h-9 w-9 shrink-0 rounded-md', className)}>
      {/* An assistant keeps the same "AI" tile whatever model it runs on. */}
      {!isAssistant && src ? <AvatarImage src={src} alt="" className="object-cover" /> : null}
      <AvatarFallback
        data-testid={isAssistant ? 'assistant-avatar' : undefined}
        className={cn(
          'rounded-md text-[13px] font-semibold',
          isAssistant
            ? isOthersAssistant
              ? 'bg-muted text-primary'
              : 'bg-primary text-primary-foreground'
            : 'bg-muted text-foreground',
          fallbackClassName,
        )}
      >
        {isAssistant ? 'AI' : (name.trim().charAt(0) || '?').toUpperCase()}
      </AvatarFallback>
    </Avatar>
  )
}
