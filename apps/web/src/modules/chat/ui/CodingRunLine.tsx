import { ClipboardCopy, Pause, Play, Square } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { CodingRunAction, CodingRunLine as CodingRunLineModel } from '../domain/coding-run'

const DOT: Record<CodingRunLineModel['phase'], string> = {
  running: 'animate-pulse bg-primary',
  waiting: 'bg-warning',
  paused: 'bg-warning',
  stopping: 'animate-pulse bg-muted-foreground',
  stopped: 'bg-muted-foreground',
  failed: 'bg-destructive',
  reconnecting: 'animate-pulse bg-warning',
  completed: 'bg-success',
}

const ACTION_LABEL: Record<CodingRunAction, string> = {
  pause: '暂停',
  resume: '继续',
  stop: '停止',
  copyLog: '复制运行日志',
  retry: '重试',
}

const ACTION_ICON: Record<CodingRunAction, typeof Pause> = {
  pause: Pause,
  resume: Play,
  stop: Square,
  copyLog: ClipboardCopy,
  retry: Play,
}

/** W10: the one line under the title while a coding tool works in a folder. */
export function CodingRunLine({
  line,
  busy,
  onAction,
}: {
  line: CodingRunLineModel
  busy?: boolean
  onAction: (action: CodingRunAction) => void
}) {
  return (
    <div data-testid="coding-run-line" role="group" aria-label="编程工具运行情况" className="flex min-h-9 items-center gap-2 border-b border-border/50 bg-muted/10 px-4 py-1.5 text-xs">
      <span className={cn('size-1.5 shrink-0 rounded-full', DOT[line.phase])} aria-hidden="true" />
      <span className="min-w-0 flex-1 truncate text-muted-foreground">
        <span className="font-medium text-foreground">{line.toolName}</span>
        {line.text ? <span> {line.text}</span> : null}
        {line.detail ? <>{line.text ? ' · ' : ' '}<span>{line.detail}</span></> : null}
      </span>
      {line.actions.map((action) => {
        const Icon = ACTION_ICON[action]
        return (
          <Button
            key={action}
            variant="ghost"
            size="sm"
            className="h-6 shrink-0 gap-1 px-2 text-xs"
            disabled={busy}
            onClick={() => onAction(action)}
          >
            <Icon className="h-3 w-3" aria-hidden="true" />
            {ACTION_LABEL[action]}
          </Button>
        )
      })}
    </div>
  )
}
