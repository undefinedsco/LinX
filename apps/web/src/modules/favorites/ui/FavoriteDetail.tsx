import type { ReactNode } from 'react'
import type { FavoriteRow } from '@undefineds.co/models'
import { Star } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  canOpenFavoriteSource,
  canShowFavoriteSnapshot,
  type FavoriteSourceStatus,
} from '../domain/source-status'
import { favoriteGroupOf } from '../domain/groups'

// ============================================================================
// Helpers
// ============================================================================

const SOURCE_COPY: Record<string, { label: string; noun: string; open: string }> = {
  chat: { label: '会话', noun: '会话', open: '在会话中查看' },
  thread: { label: '话题', noun: '话题', open: '在会话中查看' },
  messages: { label: '消息', noun: '消息', open: '在会话中查看' },
  files: { label: '文件', noun: '文件', open: '打开文件' },
  contacts: { label: '联系人', noun: '联系人', open: '查看联系人' },
}
const FALLBACK_COPY = { label: '收藏', noun: '内容', open: '打开原处' }

function chatTitleOf(favorite: FavoriteRow): string | null {
  if (!favorite.snapshotMeta) return null
  try {
    const parsed = JSON.parse(favorite.snapshotMeta) as { chatTitle?: unknown }
    return typeof parsed?.chatTitle === 'string' && parsed.chatTitle ? parsed.chatTitle : null
  } catch {
    return null
  }
}

function formatDate(value: unknown): string | null {
  if (!value) return null
  const d = value instanceof Date ? value : new Date(value as string)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleString('zh-CN', {
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

// ============================================================================
// Empty State
// ============================================================================

export function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-3">
      <Star className="w-12 h-12 text-muted-foreground/30" />
      <p className="text-sm">选择一个收藏项查看详情</p>
    </div>
  )
}

// ============================================================================
// Detail View
// ============================================================================

export function FavoriteDetail({
  favorite,
  sourceStatus = 'unknown',
  onRemove,
  onOpenSource,
}: {
  favorite: FavoriteRow
  sourceStatus?: FavoriteSourceStatus
  onRemove: () => void
  onOpenSource: () => void
}) {
  const copy = favoriteGroupOf(favorite) === 'cards'
    ? { label: '卡片', noun: '卡片', open: '查看卡片' }
    : SOURCE_COPY[favorite.sourceModule ?? ''] ?? FALLBACK_COPY
  const savedAt = formatDate(favorite.favoredAt)
  const byline = [copy.label, favorite.snapshotAuthor, savedAt].filter(Boolean).join(' · ')
  const chatTitle = chatTitleOf(favorite)
  const showSnapshot = canShowFavoriteSnapshot(sourceStatus) && Boolean(favorite.snapshotContent)

  if (sourceStatus === 'deleted') {
    return (
      <StateNotice
        title={`原${copy.noun}已被删除`}
        detail={[chatTitle ? `来自 ${chatTitle}` : null, savedAt].filter(Boolean).join(' · ') || undefined}
        action={<Button variant="outline" size="sm" onClick={onRemove}>移除这条收藏</Button>}
      />
    )
  }

  if (sourceStatus === 'forbidden') {
    return (
      <StateNotice
        title="没有权限了"
        detail={`${chatTitle ? `你已不在“${chatTitle}”里，` : ''}内容不再显示。重新获得权限后会恢复`}
        action={<Button variant="outline" size="sm" onClick={onRemove}>取消收藏</Button>}
      />
    )
  }

  return (
    <ScrollArea className="h-full">
      <div className="p-6 max-w-2xl mx-auto space-y-5">
        <div>
          <h2 className="text-lg font-semibold text-foreground leading-tight">{favorite.title}</h2>
          <p className="mt-1 text-xs text-muted-foreground">{byline}</p>
        </div>

        {sourceStatus === 'checking' ? (
          <div aria-label="正在确认原内容" className="h-16 rounded-lg bg-muted/60 animate-pulse" />
        ) : showSnapshot ? (
          <div className="rounded-lg border border-border bg-card p-4">
            <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">
              {favorite.snapshotContent}
            </p>
          </div>
        ) : null}

        {sourceStatus === 'offline' || sourceStatus === 'unreachable' ? (
          <p className="text-xs text-muted-foreground">
            {sourceStatus === 'offline' ? '没有网络' : '暂时读不到原处'}：显示的是上次看到的内容，暂时不能跳回原处
          </p>
        ) : null}

        <div className="flex items-center gap-3">
          <Button size="sm" onClick={onOpenSource} disabled={!canOpenFavoriteSource(sourceStatus)}>
            {copy.open}
          </Button>
          <Button variant="outline" size="sm" onClick={onRemove}>
            取消收藏
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">取消收藏不会删除原{copy.noun}</p>
      </div>
    </ScrollArea>
  )
}

function StateNotice({ title, detail, action }: { title: string; detail?: string; action: ReactNode }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
      <p className="text-sm font-medium text-foreground">{title}</p>
      {detail ? <p className="text-xs text-muted-foreground">{detail}</p> : null}
      <div className="mt-2">{action}</div>
    </div>
  )
}
