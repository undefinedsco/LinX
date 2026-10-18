import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { SolidProfileRow } from '@undefineds.co/models'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'
import { useSession } from '@/providers/solid-session-context'
import { useSolidDatabase } from '@/providers/solid-database-provider'
import { readProfile } from './collections'
import { profileInitial, useAuthenticatedAvatar } from './avatar'

function readText(profile: SolidProfileRow | null | undefined, field: 'name' | 'nick' | 'avatar'): string {
  const value = (profile as Record<string, unknown> | null | undefined)?.[field]
  return typeof value === 'string' ? value.trim() : ''
}

/**
 * The signed-in person's own avatar for the rail. Shares the profile query
 * with SelfProfileCard; never falls back to the LinX product mark.
 */
export function SelfAvatar({ className }: { className?: string }) {
  const { session } = useSession()
  const { db } = useSolidDatabase()
  const webId = session.info.webId || ''
  const { data: profile } = useQuery({
    queryKey: ['profile', webId],
    queryFn: async () => (db && webId ? await readProfile(db, webId) : null),
    enabled: !!db && !!webId,
  })
  const name = useMemo(() => readText(profile, 'name') || readText(profile, 'nick'), [profile])
  const avatarSrc = readText(profile, 'avatar')
  const { previewUrl, failed, markFailed } = useAuthenticatedAvatar(avatarSrc, session.fetch)

  return (
    <Avatar className={cn('rounded-md', className)}>
      {previewUrl && !failed ? (
        <AvatarImage src={previewUrl} alt={name || '我的头像'} className="object-cover" onError={markFailed} />
      ) : null}
      <AvatarFallback className="!rounded-md bg-background text-sm font-semibold text-foreground ring-1 ring-inset ring-border">
        {profileInitial(name)}
      </AvatarFallback>
    </Avatar>
  )
}
