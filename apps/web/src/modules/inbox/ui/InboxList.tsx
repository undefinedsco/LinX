import type { KeyboardEvent, ReactNode } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import type { InboxAutoWaitingView, InboxListItemView } from '../domain/inbox-item'
import type { InboxFilter } from '../domain/utils'
import { formatInboxStatusLabel } from '../domain/presentation'

export interface InboxListProps {
  filter: InboxFilter
  setFilter: (filter: InboxFilter) => void
  selectedItemId: string | null
  selectItem: (id: string | null) => void
  items: InboxListItemView[]
  isLoading: boolean
  summary: { total: number; pending: number; audit: number; autoWaiting: number; autoApproved: number }
  autoWaiting: InboxAutoWaitingView[]
  onApproveWaiting: (id: string) => void
  onRejectWaiting: (id: string) => void
  onTakeOverWaiting: (id: string) => void
  selectedIndex: number
  onItemKeyDown: (index: number, event: KeyboardEvent<HTMLButtonElement>) => void
  registerItemRef: (index: number, node: HTMLButtonElement | null) => void
}

const EMPTY_COPY: Record<InboxFilter, { title: string; hint?: string }> = {
  pending: { title: '没有要决定的事', hint: '需要你决定、回答或登录时会出现在这里' },
  done: { title: '还没有处理过的事', hint: '已处理的会保留 30 天' },
  audit: { title: '还没有活动记录' },
  review: { title: 'LinX 还没有替你批过什么', hint: '它按你的授权自动通过的事会出现在这里' },
  all: { title: '收件箱是空的' },
}

/** The resource a request touches, named the way a person would recognise it. */
function shortResourceName(iri: string): string {
  const withoutFragment = iri.split('#')[0] ?? iri
  const segment = withoutFragment.split('/').filter(Boolean).pop() ?? withoutFragment
  try {
    return decodeURIComponent(segment)
  } catch {
    return segment
  }
}

function describeStatus(item: InboxListItemView): { label: string; waiting: boolean } {
  const isActive = item.status === 'pending' || item.status === 'handling'
  if (item.category === 'auth_required') {
    return item.status === 'resolved' ? { label: '已完成', waiting: false } : { label: '待登录', waiting: true }
  }
  if (item.kind === 'approval' && item.status === 'pending') return { label: '待批准', waiting: true }
  if (item.kind === 'input_request' && isActive) return { label: '待回答', waiting: true }
  return { label: formatInboxStatusLabel(item.status) ?? '', waiting: false }
}

function SegmentButton({ active, onClick, children }: {
  active: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'h-6 rounded-[5px] px-2 text-xs transition-colors',
        active ? 'bg-card font-medium text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
      )}
    >
      {children}
    </button>
  )
}

export function InboxList({
  filter,
  setFilter,
  selectedItemId,
  selectItem,
  items,
  isLoading,
  summary,
  autoWaiting,
  onApproveWaiting,
  onRejectWaiting,
  onTakeOverWaiting,
  selectedIndex,
  onItemKeyDown,
  registerItemRef,
}: InboxListProps) {
  const isReview = filter === 'review'
  const isActivityLog = filter === 'audit' || isReview
  const backLabel = '返回收件箱'
  const empty = EMPTY_COPY[filter]

  return (
    <div className="flex h-full flex-col bg-layout-list-item">
      <div className="h-12 flex items-center gap-2 px-3 border-b border-border bg-layout-list-header shrink-0">
        {isActivityLog ? (
          <>
            <button
              type="button"
              onClick={() => setFilter('pending')}
              aria-label={backLabel}
              className="-ml-1 flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-layout-list-hover hover:text-foreground"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <h2 className="truncate text-sm font-semibold text-foreground">{isReview ? 'LinX 自动通过的' : '活动记录'}</h2>
          </>
        ) : (
          <>
            <h2 className="truncate text-sm font-semibold text-foreground">收件箱</h2>
            <div role="group" aria-label="收件箱视图" className="ml-auto flex shrink-0 items-center gap-0.5 rounded-md bg-muted p-0.5">
              <SegmentButton active={filter === 'pending'} onClick={() => setFilter('pending')}>
                待处理{summary.pending > 0 ? ` ${summary.pending > 99 ? '99+' : summary.pending}` : ''}
              </SegmentButton>
              <SegmentButton active={filter === 'done'} onClick={() => setFilter('done')}>已处理</SegmentButton>
            </div>
          </>
        )}
      </div>

      <ScrollArea className="flex-1">
        <div role="listbox" aria-label={isReview ? 'LinX 自动通过的' : isActivityLog ? '活动记录' : '收件箱'} aria-orientation="vertical" className="py-1">
          {isLoading && (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">正在读取…</p>
          )}

          {!isLoading && items.length === 0 && (
            <div className="px-4 py-10 text-center">
              <p className="text-sm text-foreground">{empty.title}</p>
              {empty.hint ? <p className="mt-1 text-xs text-muted-foreground">{empty.hint}</p> : null}
            </div>
          )}

          {isReview ? <p className="px-4 pb-1 pt-2 text-xs text-muted-foreground">对外发送、花钱、删除只有你单独授权过才会出现在这里。</p> : null}

          {items.map((item, index) => {
            const isSelected = item.id === selectedItemId
            const tabbable = isSelected || (selectedIndex < 0 && index === 0)
            const status = describeStatus(item)
            const detail = item.approvalTarget ? shortResourceName(item.approvalTarget) : item.description

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
                  'block w-full px-4 py-2.5 text-left transition-colors',
                  isSelected ? 'bg-layout-list-selected' : 'hover:bg-layout-list-hover',
                )}
              >
                <div className="flex items-center gap-2">
                  {status.waiting ? <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" /> : null}
                  <p className="min-w-0 flex-1 truncate text-sm text-foreground">{item.title}</p>
                  <span className="shrink-0 text-[11px] text-muted-foreground">{item.formattedTime}</span>
                </div>
                <p
                  className="mt-0.5 truncate text-xs text-muted-foreground"
                  title={item.approvalTarget ?? undefined}
                >
                  <span className={cn(status.waiting && 'text-primary')}>{item.autoApproved ? 'LinX 替你批准' : status.label}</span>
                  {status.label && detail ? ' · ' : ''}
                  {detail}
                </p>
              </button>
            )
          })}

          {filter === 'pending' && autoWaiting.length > 0 ? (
            <section aria-label="LinX 会自动通过" className="mt-2">
              <h3 className="px-4 pb-1 pt-2 text-xs text-muted-foreground">LinX 会自动通过 · {autoWaiting.length}</h3>
              <ul className="mx-3 overflow-hidden rounded-lg bg-card">
                {autoWaiting.map((row) => (
                  <li key={row.id} className="border-b border-border px-3 py-2 last:border-b-0">
                    <button
                      type="button"
                      onClick={() => selectItem(row.id)}
                      className={cn('block w-full text-left', row.id === selectedItemId && 'font-medium')}
                    >
                      <span className="block truncate text-sm text-foreground">{row.title}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {row.remainingLabel} · {row.confidenceLabel}{row.detail ? ` · ${row.detail}` : ''}
                      </span>
                    </button>
                    <div className="mt-1.5 flex gap-1.5">
                      <button type="button" onClick={() => onApproveWaiting(row.id)} className="h-6 rounded-md border border-border px-2 text-xs text-foreground hover:bg-layout-list-hover">现在批准</button>
                      <button type="button" onClick={() => onRejectWaiting(row.id)} className="h-6 rounded-md border border-border px-2 text-xs text-foreground hover:bg-layout-list-hover">拒绝</button>
                      <button type="button" onClick={() => onTakeOverWaiting(row.id)} className="h-6 rounded-md border border-border px-2 text-xs text-foreground hover:bg-layout-list-hover">我来判断</button>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {!isActivityLog && summary.autoApproved > 0 ? (
            <button
              type="button"
              onClick={() => setFilter('review')}
              className="mx-3 mt-2 flex h-10 w-[calc(100%-1.5rem)] items-center justify-between rounded-lg bg-card px-3 text-sm text-foreground hover:bg-layout-list-hover"
            >
              LinX 自动通过的 · {summary.autoApproved}
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </button>
          ) : null}
        </div>
      </ScrollArea>

      {isActivityLog ? null : (
        <button
          type="button"
          onClick={() => setFilter('audit')}
          className="flex h-10 shrink-0 items-center justify-between border-t border-border px-4 text-sm text-muted-foreground hover:bg-layout-list-hover hover:text-foreground"
        >
          活动记录
          <ChevronRight className="h-4 w-4" />
        </button>
      )}
    </div>
  )
}
