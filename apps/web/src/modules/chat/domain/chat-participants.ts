import { toStringArray } from '@/lib/utils'

export function getPrimaryParticipantUri(
  chat: { participants?: unknown } | null | undefined,
  currentWebId?: string | null,
): string | null {
  const participants = toStringArray(chat?.participants)
  const normalizedCurrentWebId = currentWebId ?? null

  const counterparts = participants.filter((participant) => participant && participant !== normalizedCurrentWebId)
  if (counterparts.length !== 1) {
    return null
  }
  return counterparts[0] ?? null
}
