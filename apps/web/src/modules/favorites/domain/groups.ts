import type { FavoriteRow } from '@undefineds.co/models'

/** The five buckets of the 收藏 left column (K7). */
export type FavoriteGroup = 'messages' | 'chats' | 'files' | 'cards' | 'contacts'
export type FavoriteGroupFilter = 'all' | FavoriteGroup

export const FAVORITE_GROUPS: ReadonlyArray<{ id: FavoriteGroup; label: string }> = [
  { id: 'messages', label: '消息' },
  { id: 'chats', label: '会话' },
  { id: 'files', label: '文件' },
  { id: 'cards', label: '卡片' },
  { id: 'contacts', label: '联系人' },
]

type GroupableRow = Pick<FavoriteRow, 'sourceModule' | 'sourceId'> & {
  targetUri?: string | null
  snapshotMeta?: string | null
}

function metaKind(raw?: string | null): string | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as { kind?: unknown }
    return typeof parsed?.kind === 'string' ? parsed.kind : null
  } catch {
    return null
  }
}

/** A card is a subject inside a data document (file#id), as opposed to a whole file. */
export function favoriteGroupOf(row: GroupableRow): FavoriteGroup {
  switch (row.sourceModule) {
    case 'messages':
      return 'messages'
    case 'chat':
    case 'thread':
      return 'chats'
    case 'contacts':
      return 'contacts'
    default: {
      if (metaKind(row.snapshotMeta) === 'card') return 'cards'
      const target = row.targetUri ?? row.sourceId ?? ''
      if (row.sourceModule === 'files' && /^https?:\/\/[^#]+#.+/u.test(target)) return 'cards'
      return 'files'
    }
  }
}

export function countFavoriteGroups(rows: ReadonlyArray<GroupableRow>): Record<FavoriteGroupFilter, number> {
  const counts: Record<FavoriteGroupFilter, number> = {
    all: rows.length, messages: 0, chats: 0, files: 0, cards: 0, contacts: 0,
  }
  for (const row of rows) counts[favoriteGroupOf(row)] += 1
  return counts
}
