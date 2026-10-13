import { useEffect, useRef, useState } from 'react'
import { ActionBarPrimitive, useAuiState } from '@assistant-ui/react'
import { readLinxProgress, type LinxProgressStep } from '@linx/agent-runtime/ag-ui'
import { Check, ChevronDown, Loader2, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useStopState } from './run-state'

export interface ProcessSummary {
  headline: string
  detail: string | null
  tone: 'running' | 'waiting' | 'stopping' | 'stopped' | 'failed' | 'done'
}

/** The one line of W1 / W1b: what the assistant is doing, as plain words. */
export function summarizeProgress(
  steps: readonly LinxProgressStep[],
  phase: string,
  options: { stopping?: boolean; cancelled?: boolean } = {},
): ProcessSummary {
  const done = steps.filter((step) => step.status === 'done').length
  const current = [...steps].reverse().find((step) => step.status === 'running') ?? steps[steps.length - 1]
  if (options.stopping || phase === 'stopping') {
    return { headline: '正在停止…', detail: '已完成的步骤不会撤回', tone: 'stopping' }
  }
  if (options.cancelled || phase === 'stopped') {
    return { headline: '已停止', detail: `完成了 ${done} 步`, tone: 'stopped' }
  }
  if (phase === 'failed') {
    return { headline: '某一步没成功', detail: current ? `${current.title}没成功，其余照常` : null, tone: 'failed' }
  }
  if (phase === 'waiting') {
    return { headline: current?.title ? `等你决定：${current.title}` : '等你处理', detail: null, tone: 'waiting' }
  }
  if (phase === 'done' || phase === 'interrupted') {
    return { headline: `完成 · ${steps.length} 步`, detail: null, tone: 'done' }
  }
  return {
    headline: current?.title ?? '正在处理',
    detail: steps.length > 0 ? `第 ${steps.length} 步` : null,
    tone: 'running',
  }
}

function StepIcon({ status }: { status: LinxProgressStep['status'] }) {
  if (status === 'running') return <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" aria-label="进行中" />
  if (status === 'failed') return <X className="h-3.5 w-3.5 text-destructive" aria-label="没成功" />
  if (status === 'skipped') return <X className="h-3.5 w-3.5 text-muted-foreground" aria-label="已跳过" />
  return <Check className="h-3.5 w-3.5" aria-label="已完成" />
}

/** Renders the `linx-progress` activity of a message. */
export function ProcessLine({ data }: { name: string; data: unknown }) {
  const progress = readLinxProgress(data)
  const stopState = useStopState()
  const isLast = useAuiState((state) => state.message.isLast)
  const status = useAuiState((state) => state.message.status)
  const cancelled = status?.type === 'incomplete' && status.reason === 'cancelled'
  const phase = progress?.phase ?? 'running'
  const [open, setOpen] = useState(phase === 'running')
  const touched = useRef(false)
  useEffect(() => {
    // Open while it works, fold into one line when it is finished (unless the person chose).
    if (!touched.current) setOpen(phase === 'running')
  }, [phase])
  if (!progress || progress.steps.length === 0) return null

  const summary = summarizeProgress(progress.steps, phase, { stopping: isLast && stopState === 'stopping', cancelled })
  return (
    <div className="w-full min-w-[260px] max-w-[440px] overflow-hidden rounded-lg border border-border bg-card text-sm">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => { touched.current = true; setOpen((value) => !value) }}
        className="flex w-full items-center gap-2 px-3 py-2 text-left"
      >
        {summary.tone === 'running' || summary.tone === 'stopping'
          ? <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-primary" aria-hidden="true" />
          : summary.tone === 'done' ? <Check className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
          : <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-hidden="true" />}
        <span className="min-w-0 flex-1 truncate">{summary.headline}</span>
        {summary.detail ? <span className="shrink-0 text-xs text-muted-foreground">{summary.detail}</span> : null}
        <ChevronDown className={cn('h-3 w-3 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')} aria-hidden="true" />
      </button>
      {open ? (
        <ol className="flex flex-col gap-1.5 border-t border-border px-3 py-2.5 text-[13px]">
          {progress.steps.map((step, index) => (
            <li key={`${index}-${step.title}`} className="flex items-center gap-2">
              <StepIcon status={step.status} />
              <span className={cn(step.status === 'skipped' && 'text-muted-foreground line-through')}>{step.title}</span>
            </li>
          ))}
        </ol>
      ) : null}
      {summary.tone === 'failed' ? (
        <div className="border-t border-border px-3 py-1.5">
          <ActionBarPrimitive.Reload className="text-xs text-primary hover:underline">重试这一步</ActionBarPrimitive.Reload>
        </div>
      ) : null}
    </div>
  )
}
