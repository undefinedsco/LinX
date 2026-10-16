import { formatListTime, listTimeValue } from './list-time'
import type { TopicStatus } from './topic-status'

/**
 * S1 / S0b: one row per identity — an assistant, a person or a group.
 * Topics never become rows; the busiest topic only colours the preview.
 */
export type ChatIdentityKind = 'assistant' | 'person' | 'group'

export interface ChatListEntrySource {
  id: string
  title: string
  kind: ChatIdentityKind
  avatarUrl?: string | null
  preview?: string | null
  lastActiveAt?: unknown
  starred: boolean
  muted: boolean
  unreadCount: number
  /** The built-in LinX assistant: it can't be deleted, only its topics can. */
  isProtected: boolean
  headlineTopic?: { title: string; status: TopicStatus } | null
}

export interface ChatListEntry {
  id: string
  title: string
  kind: ChatIdentityKind
  avatarUrl: string | null
  avatarText: string
  time: string
  preview: string
  /** Waiting on you or working right now: “# 话题 · 等你决定”. */
  previewAccent: boolean
  unreadCount: number
  unreadBadge: string | null
  muted: boolean
  starred: boolean
  isProtected: boolean
  canDelete: boolean
  canLeave: boolean
  sortTime: number
}

export { LINX_ASSISTANT_DISPLAY_NAME, displayAssistantName } from '@/lib/assistant-name'

export function avatarTextFor(kind: ChatIdentityKind, title: string): string {
  if (kind === 'assistant') return 'AI'
  return Array.from(title.trim())[0]?.toLocaleUpperCase() ?? '?'
}

export function unreadBadgeText(count: number): string | null {
  if (!Number.isFinite(count) || count <= 0) return null
  return count > 99 ? '99+' : String(Math.floor(count))
}

export function projectChatListEntry(source: ChatListEntrySource, now: number = Date.now()): ChatListEntry {
  const topic = source.headlineTopic
  // The state of the chat (running, needs you...), never a topic name.
  const preview = topic
    ? topic.status.label
    : source.preview?.trim() || '还没有消息'
  return {
    id: source.id,
    title: source.title,
    kind: source.kind,
    avatarUrl: source.avatarUrl ?? null,
    avatarText: avatarTextFor(source.kind, source.title),
    time: formatListTime(source.lastActiveAt, now),
    preview,
    previewAccent: Boolean(topic),
    unreadCount: Math.max(0, source.unreadCount || 0),
    unreadBadge: unreadBadgeText(source.unreadCount),
    muted: source.muted,
    starred: source.starred,
    isProtected: source.isProtected,
    canDelete: !source.isProtected && source.kind !== 'group',
    canLeave: source.kind === 'group',
    sortTime: listTimeValue(source.lastActiveAt),
  }
}

/**
 * LinX 助手 first, then 标星 (there is no separate 置顶), then the most recent
 * conversation.
 */
export function orderChatListEntries<T extends Pick<ChatListEntry, 'starred' | 'sortTime' | 'isProtected'>>(entries: readonly T[]): T[] {
  return entries
    .map((entry, index) => ({ entry, index }))
    .sort((left, right) => (
      Number(right.entry.isProtected) - Number(left.entry.isProtected)
      || Number(right.entry.starred) - Number(left.entry.starred)
      || right.entry.sortTime - left.entry.sortTime
      || left.index - right.index
    ))
    .map(({ entry }) => entry)
}

export function deleteChatCopy(entry: Pick<ChatListEntry, 'title' | 'kind'>, _topicCount?: number): { title: string; description: string } {
  const who = entry.kind === 'person' ? `和${entry.title}的会话` : `“${entry.title}”`
  const topics = '聊天记录'
  return {
    title: `删除${who}？`,
    description: `${topics}会被删除，不能恢复。发过的文件和知识卡片不受影响。`,
  }
}
