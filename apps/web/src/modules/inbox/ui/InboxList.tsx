import type { KeyboardEvent } from 'react'
import { AlertCircle, Bell, CheckCircle2, Clock3, KeyRound, ShieldAlert } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import type { InboxListItemView } from '../domain/inbox-item'
import type { InboxFilter } from '../domain/utils'
import { formatInboxStatusLabel } from '../domain/presentation'

const FILTER_LABELS: Record<InboxFilter, string> = {
  all: '全部',
  pending: '待处理',
  audit: '审计',
}

export interface InboxListProps {
  filter: InboxFilter
  setFilter: (filter: InboxFilter) => void
  selectedItemId: string | null
  selectItem: (id: string | null) => void
  items: InboxListItemView[]
  isLoading: boolean
  isError: boolean
  error: unknown
  refetch: () => Promise<unknown>
  summary: { total: number; pending: number; audit: number }
  selectedIndex: number
  onItemKeyDown: (index: number, event: KeyboardEvent<HTMLButtonElement>) => void
  registerItemRef: (index: number, node: HTMLButtonElement | null) => void
}

export function InboxList({
  filter,
  setFilter,
  selectedItemId,
  selectItem,
  items,
  isLoading,
  isError,
  refetch,
  summary,
  selectedIndex,
  onItemKeyDown,
  registerItemRef,
}: InboxListProps) {
  return (
    <div className="flex h-full flex-col bg-layout-list-item">
      <div className="h-12 flex items-center gap-2 px-3 border-b border-border bg-layout-list-header shrink-0">
        <Bell className="h-4 w-4 shrink-0 text-primary" />
        <h2 className="truncate text-sm font-semibold text-foreground">统一收件箱</h2>
      </div>
      <div className="shrink-0 space-y-2 border-b border-border/50 px-3 py-2">
        <p className="text-xs leading-5 text-muted-foreground">
          集中查看运行时授权、认证请求与审计记录。
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">{summary.total} 条</Badge>
          <Badge variant="outline">{summary.pending} 待处理</Badge>
          <Badge variant="outline">{summary.audit} 审计事件</Badge>
        </div>
        <div className="flex gap-2">
          {(['all', 'pending', 'audit'] as InboxFilter[]).map((item) => (
            <Button
              key={item}
              variant={filter === item ? 'default' : 'outline'}
              size="sm"
              className="h-8"
              onClick={() => setFilter(item)}
            >
              {FILTER_LABELS[item]}
            </Button>
          ))}
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div role="listbox" aria-label="收件箱" aria-orientation="vertical" className="space-y-2 p-3">
          {isError && items.length > 0 && (
            <div className="flex items-center justify-between gap-2 border-b border-destructive/20 px-1 pb-2 text-xs text-destructive">
              <span>同步失败，当前显示上次内容</span>
              <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => void refetch()}>重试</Button>
            </div>
          )}

          {isLoading && (
            <div className="rounded-xl border border-border/50 bg-card/60 px-3 py-4 text-sm text-muted-foreground">
              正在从当前空间读取收件箱…
            </div>
          )}

          {!isLoading && isError && items.length === 0 && (
            <div className="flex flex-col items-center gap-3 px-3 py-8 text-center">
              <AlertCircle className="h-5 w-5 text-destructive" />
              <p className="text-sm font-medium text-foreground">收件箱加载失败</p>
              <Button variant="outline" size="sm" onClick={() => void refetch()}>重试</Button>
            </div>
          )}

          {!isLoading && !isError && items.length === 0 && (
            <div className="rounded-xl border border-dashed border-border/60 bg-card/30 px-3 py-6 text-center text-sm text-muted-foreground">
              当前还没有 inbox 事件。
            </div>
          )}

          {items.map((item, index) => {
            const isSelected = item.id === selectedItemId
            const tabbable = isSelected || (selectedIndex < 0 && index === 0)
            const isPendingApproval = item.kind === 'approval' && item.status === 'pending'
            const isResolvedAuth = item.category === 'auth_required' && item.status === 'resolved'
            const isPendingAuthRequired = item.category === 'auth_required' && item.status !== 'resolved'
            const statusLabel = isPendingApproval
              ? '待授权'
              : isPendingAuthRequired
                ? '待认证'
                : isResolvedAuth
                  ? '已完成'
                  : formatInboxStatusLabel(item.status)

            return (
              <button
                key={item.id}
                type="button"
                role="option"
                aria-selected={isSelected}
                tabIndex={tabbable ? 0 : -1}
                ref={(node) => registerItemRef(index, node)}
                onKeyDown={(event) => onItemKeyDown(index, event)}
                onClick={() => selectItem(item.id)}
                className={cn(
                  'w-full rounded-xl border px-3 py-3 text-left transition-colors',
                  isSelected
                    ? 'border-primary/40 bg-primary/10'
                    : 'border-border/50 bg-card/50 hover:bg-accent/50',
                  isResolvedAuth && !isSelected && 'border-success/20 bg-success/5 opacity-80',
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      {isPendingApproval ? (
                        <ShieldAlert className="h-4 w-4 shrink-0 text-warning" />
                      ) : isResolvedAuth ? (
                        <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />
                      ) : isPendingAuthRequired ? (
                        <KeyRound className="h-4 w-4 shrink-0 text-boundary" />
                      ) : (
                        <Clock3 className="h-4 w-4 shrink-0 text-muted-foreground" />
                      )}
                      <p className="truncate text-sm font-medium text-foreground">{item.title}</p>
                      {statusLabel && (
                        <Badge
                          variant="outline"
                          className={cn(
                            'shrink-0 text-[10px]',
                            isPendingApproval && 'border-warning/30 text-warning',
                            isPendingAuthRequired && 'border-boundary/30 text-boundary',
                            (isResolvedAuth || item.status === 'approved' || item.status === 'completed') && 'border-success/30 text-success',
                            item.status === 'rejected' && 'border-destructive/30 text-destructive',
                            item.status === 'error' && 'border-destructive/30 text-destructive',
                            item.status === 'active' && 'border-primary/30 text-primary',
                            item.status === 'paused' && 'border-slate-400/40 text-slate-600',
                          )}
                        >
                          {statusLabel}
                        </Badge>
                      )}
                    </div>
                    <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{item.description}</p>
                    {item.approvalTarget ? (
                      <p className="mt-1 truncate text-[11px] leading-4 text-muted-foreground/70" title={item.approvalTarget}>
                        {item.approvalTarget}
                      </p>
                    ) : null}
                  </div>
                  <span className="shrink-0 text-[11px] text-muted-foreground">{item.formattedTime}</span>
                </div>
              </button>
            )
          })}
        </div>
      </ScrollArea>
    </div>
  )
}
