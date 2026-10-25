import { useCallback } from 'react'
import { useSession } from '@/providers/solid-session-context'
import { displayNameOf } from '@/modules/chat/domain/display-name'
import { displayResourceName } from '@/modules/files/domain/resource/resource-semantics'

type DisplayFields = { sourceModule?: string | null; title?: string | null; snapshotAuthor?: string | null }

/**
 * Read-time labels for favorites saved before the write-time fixes: `.data` reads
 * 数据 (as in the Files tree) and the person's own name@provider label reads 我.
 */
export function resolveFavoriteDisplay<T extends DisplayFields>(row: T, selfWebId?: string | null): T {
  let next = row
  if (row.sourceModule === 'files' && row.title === '.data') {
    next = { ...next, title: displayResourceName(row.title) }
  }
  if (row.snapshotAuthor && selfWebId && row.snapshotAuthor === displayNameOf(selfWebId)) {
    next = { ...next, snapshotAuthor: '我' }
  }
  return next
}

export function useResolveFavoriteDisplay() {
  const { session } = useSession()
  const webId = session.info.webId
  return useCallback(<T extends DisplayFields>(row: T) => resolveFavoriteDisplay(row, webId), [webId])
}
