/**
 * FavoriteContentPane - 收藏详情面板
 *
 * 功能：快照详情、打开原对象、取消收藏
 */
import { useMemo, useCallback } from 'react'
import { useNavigate } from '@tanstack/react-router'
import type { MicroAppPaneProps } from '@/modules/layout/micro-app-registry'
import { useFavoriteStore } from '../store'
import { useFavoriteList, useFavoriteMutations } from '../collections'
import type { FavoriteRow } from '@linx/models'
import {
  Star,
  ExternalLink,
  Trash2,
  Calendar,
  User,
  FileText,
  MessageSquare,
  Users,
  FolderOpen,
  Mail,
  GitBranch,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'

// ============================================================================
// Helpers
// ============================================================================

const SOURCE_META: Record<string, { label: string; icon: typeof Star }> = {
  chat: { label: '聊天', icon: MessageSquare },
  contacts: { label: '联系人', icon: Users },
  files: { label: '文件', icon: FolderOpen },
  messages: { label: '消息', icon: Mail },
  thread: { label: '话题', icon: GitBranch },
}

function formatDate(value: unknown): string {
  if (!value) return '未知'
  const d = value instanceof Date ? value : new Date(value as string)
  if (Number.isNaN(d.getTime())) return '未知'
  return d.toLocaleString('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function parseSnapshotMeta(raw?: string | null): Record<string, string> | null {
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

// ============================================================================
// Empty State
// ============================================================================

function EmptyState() {
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

function FavoriteDetail({
  favorite,
  onRemove,
  onOpenSource,
}: {
  favorite: FavoriteRow
  onRemove: () => void
  onOpenSource: () => void
}) {
  const meta = parseSnapshotMeta(favorite.snapshotMeta)
  const sourceMeta = SOURCE_META[favorite.sourceModule ?? '']
  const SourceIcon = sourceMeta?.icon ?? FileText

  return (
    <ScrollArea className="h-full">
      <div className="p-6 max-w-2xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-start gap-4">
          <div className="shrink-0 flex items-center justify-center w-12 h-12 rounded-lg bg-amber-500/10 text-amber-500">
            <SourceIcon strokeWidth={1.5} className="w-6 h-6" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-semibold text-foreground leading-tight">
              {favorite.title}
            </h2>
            {sourceMeta && (
              <span className="inline-flex items-center gap-1 mt-1 text-xs text-muted-foreground">
                <SourceIcon strokeWidth={1.5} className="w-3 h-3" />
                {sourceMeta.label}
              </span>
            )}
          </div>
        </div>

        {/* Snapshot Content */}
        {favorite.snapshotContent && (
          <div className="rounded-lg border border-border/50 bg-muted/30 p-4">
            <p className="text-sm text-foreground/80 whitespace-pre-wrap leading-relaxed">
              {favorite.snapshotContent}
            </p>
          </div>
        )}

        {/* Meta Info */}
        <div className="space-y-3">
          {favorite.snapshotAuthor && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <User strokeWidth={1.5} className="w-4 h-4 shrink-0" />
              <span>{favorite.snapshotAuthor}</span>
            </div>
          )}
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Calendar strokeWidth={1.5} className="w-4 h-4 shrink-0" />
            <span>收藏于 {formatDate(favorite.favoredAt)}</span>
          </div>
          {favorite.updatedAt && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Calendar strokeWidth={1.5} className="w-4 h-4 shrink-0" />
              <span>更新于 {formatDate(favorite.updatedAt)}</span>
            </div>
          )}
        </div>

        {/* Snapshot Meta Tags */}
        {meta && Object.keys(meta).length > 0 && (
          <div className="flex flex-wrap gap-2">
            {Object.entries(meta).map(([key, val]) => (
              <span
                key={key}
                className="inline-flex items-center px-2 py-0.5 rounded-md bg-muted text-xs text-muted-foreground"
              >
                {key}: {val}
              </span>
            ))}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-3 pt-2">
          <Button variant="outline" size="sm" onClick={onOpenSource}>
            <ExternalLink strokeWidth={1.5} className="w-4 h-4 mr-1.5" />
            打开原对象
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="text-destructive hover:bg-destructive hover:text-destructive-foreground"
            onClick={onRemove}
          >
            <Trash2 strokeWidth={1.5} className="w-4 h-4 mr-1.5" />
            取消收藏
          </Button>
        </div>
      </div>
    </ScrollArea>
  )
}

// ============================================================================
// Main Component
// ============================================================================

export function FavoriteContentPane(_props: MicroAppPaneProps) {
  const selectedFavoriteId = useFavoriteStore((s) => s.selectedFavoriteId)
  const select = useFavoriteStore((s) => s.select)
  const { data: favorites } = useFavoriteList()
  const { removeFavorite } = useFavoriteMutations()
  const navigate = useNavigate()

  const favorite = useMemo(() => {
    if (!selectedFavoriteId || !favorites) return null
    return favorites.find((f) => f.id === selectedFavoriteId) ?? null
  }, [selectedFavoriteId, favorites])

  const handleRemove = useCallback(async () => {
    if (!favorite) return
    await removeFavorite.mutateAsync(favorite.id)
    select(null)
  }, [favorite, removeFavorite, select])

  const handleOpenSource = useCallback(() => {
    if (!favorite) return
    const mod = favorite.sourceModule
    if (mod && mod !== 'files') {
      // Navigate to the source module micro-app
      navigate({ to: '/', search: { app: mod } as any })
    }
  }, [favorite, navigate])

  if (!favorite) return <EmptyState />

  return (
    <FavoriteDetail
      favorite={favorite}
      onRemove={handleRemove}
      onOpenSource={handleOpenSource}
    />
  )
}

export default FavoriteContentPane
