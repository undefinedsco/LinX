import { useEffect } from 'react'
import { Bell, Clock3, KeyRound, ShieldAlert } from 'lucide-react'
import type { MicroAppPaneProps } from '@/modules/layout/micro-app-registry'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import { useInboxItems, useInboxSummary } from '../collections'
import { useInboxStore, type InboxFilter } from '../store'

const FILTER_LABELS: Record<InboxFilter, string> = {
  all: '全部',
  pending: '待处理',
  audit: '审计',
}

function formatTimeLabel(value: string) {
  if (!value) return '刚刚'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '刚刚'
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function InboxListPane(_props: MicroAppPaneProps) {
  const filter = useInboxStore((state) => state.filter)
  const setFilter = useInboxStore((state) => state.setFilter)
  const selectedItemId = useInboxStore((state) => state.selectedItemId)
  const selectItem = useInboxStore((state) => state.selectItem)
  const { data: items = [], isLoading } = useInboxItems()
  const summary = useInboxSummary()

  useEffect(() => {
    if (items.length === 0) {
      if (selectedItemId) selectItem(null)
      return
    }

    if (!selectedItemId || !items.some((item) => item.id === selectedItemId)) {
      selectItem(items[0].id)
    }
  }, [items, selectItem, selectedItemId])

  return (
    <div className="flex h-full flex-col bg-layout-list-item">
      <div className="border-b border-border/50 px-4 py-4">
        <div className="flex items-center gap-2">
          <Bell className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold text-foreground">统一收件箱</h2>
        </div>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          先把运行时审计、授权请求和认证提示收敛到一个入口。
        </p>

        <div className="mt-3 flex gap-2">
          <Badge variant="secondary">{summary.total} 条</Badge>
          <Badge variant="outline">{summary.pending} 待处理</Badge>
          <Badge variant="outline">{summary.audit} 审计事件</Badge>
        </div>

        <div className="mt-3 flex gap-2">
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
        <div className="space-y-2 p-3">
          {isLoading && (
            <div className="rounded-xl border border-border/50 bg-card/60 px-3 py-4 text-sm text-muted-foreground">
              正在从 Pod 读取 inbox…
            </div>
          )}

          {!isLoading && items.length === 0 && (
            <div className="rounded-xl border border-dashed border-border/60 bg-card/30 px-3 py-6 text-center text-sm text-muted-foreground">
              当前还没有 inbox 事件。
            </div>
          )}

          {items.map((item) => {
            const isSelected = item.id === selectedItemId
            const isPending = item.kind === 'approval' && item.status === 'pending'
            const isAuthRequired = item.category === 'auth_required'

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => selectItem(item.id)}
                className={cn(
                  'w-full rounded-xl border px-3 py-3 text-left transition-colors',
                  isSelected
                    ? 'border-primary/40 bg-primary/10'
                    : 'border-border/50 bg-card/50 hover:bg-accent/50',
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      {isPending ? (
                        <ShieldAlert className="h-4 w-4 shrink-0 text-amber-500" />
                      ) : isAuthRequired ? (
                        <KeyRound className="h-4 w-4 shrink-0 text-blue-500" />
                      ) : (
                        <Clock3 className="h-4 w-4 shrink-0 text-muted-foreground" />
                      )}
                      <p className="truncate text-sm font-medium text-foreground">{item.title}</p>
                    </div>
                    <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{item.description}</p>
                  </div>
                  <span className="shrink-0 text-[11px] text-muted-foreground">{formatTimeLabel(item.timestamp)}</span>
                </div>
              </button>
            )
          })}
        </div>
      </ScrollArea>
    </div>
  )
}
