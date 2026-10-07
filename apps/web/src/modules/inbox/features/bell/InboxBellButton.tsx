import { useCallback, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { Bell, CheckCircle2, Clock3, ShieldAlert } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { useInboxSummary } from '../../data/collections'
import { useInboxStore, type InboxFilter } from '../../app/store'

function SummaryMetric({
  label,
  value,
  tone = 'default',
}: {
  label: string
  value: number
  tone?: 'default' | 'pending' | 'audit'
}) {
  return (
    <div
      className={cn(
        'rounded-lg border px-3 py-2',
        tone === 'pending' && 'border-warning/30 bg-warning/5',
        tone === 'audit' && 'border-lineage/30 bg-lineage/5',
        tone === 'default' && 'border-border/50 bg-muted/20',
      )}
    >
      <div className="text-lg font-semibold text-foreground">{value}</div>
      <div className="text-[11px] text-muted-foreground">{label}</div>
    </div>
  )
}

export function InboxBellButton() {
  const navigate = useNavigate()
  const setFilter = useInboxStore((state) => state.setFilter)
  const selectItem = useInboxStore((state) => state.selectItem)
  const summary = useInboxSummary()
  const [open, setOpen] = useState(false)

  const handleOpenInbox = useCallback((filter: InboxFilter) => {
    setFilter(filter)
    selectItem(null)
    setOpen(false)
    navigate({ to: '/$microAppId', params: { microAppId: 'inbox' } })
  }, [navigate, selectItem, setFilter])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative h-9 w-9 rounded-md text-muted-foreground hover:text-foreground"
          aria-label="收件箱快捷入口"
          title="收件箱"
        >
          <Bell className="h-5 w-5" />
          {summary.pending > 0 ? (
            <span className="absolute right-1 top-1 flex min-w-4 items-center justify-center rounded-full bg-warning px-1 text-[10px] font-semibold leading-4 text-white">
              {summary.pending > 99 ? '99+' : summary.pending}
            </span>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" side="bottom" className="w-80 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Bell className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-semibold text-foreground">统一收件箱</h3>
            </div>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              集中处理运行时授权、认证请求和审计事件。
            </p>
          </div>
          {summary.pending > 0 ? (
            <Badge variant="secondary" className="border border-warning/30 bg-warning/10 text-warning">
              {summary.pending} 待处理
            </Badge>
          ) : (
            <Badge variant="outline">已清空</Badge>
          )}
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2">
          <SummaryMetric label="全部" value={summary.total} />
          <SummaryMetric label="待处理" value={summary.pending} tone="pending" />
          <SummaryMetric label="审计" value={summary.audit} tone="audit" />
        </div>

        <div className="mt-4 space-y-2">
          <Button
            variant={summary.pending > 0 ? 'default' : 'outline'}
            size="sm"
            className="h-9 w-full justify-start gap-2"
            onClick={() => handleOpenInbox(summary.pending > 0 ? 'pending' : 'all')}
          >
            <ShieldAlert className="h-4 w-4" />
            {summary.pending > 0 ? '处理待办' : '打开收件箱'}
          </Button>
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-9 justify-start gap-2"
              onClick={() => handleOpenInbox('audit')}
            >
              <Clock3 className="h-4 w-4" />
              查看审计
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-9 justify-start gap-2"
              onClick={() => handleOpenInbox('all')}
            >
              <CheckCircle2 className="h-4 w-4" />
              查看全部
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
