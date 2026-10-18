import { cn } from '@/lib/utils'

import { projectStructuredSaveLine, type StructuredSaveState } from './structured-save-state-model'

/** R6 K6d: one quiet line above the table after a cell edit: 保存中… / 已保存 / 没保存成功 重试. */
export function StructuredSaveLine({ state, onRetry }: { state: StructuredSaveState; onRetry: () => void }) {
  const line = projectStructuredSaveLine(state)
  if (!line) return null
  return (
    <p
      role="status"
      data-structured-save-line={state.status}
      className={cn('mb-1 flex items-center gap-2 text-[11px]', line.tone === 'error' ? 'text-destructive' : 'text-muted-foreground')}
    >
      <span>{line.text}</span>
      {line.retryable ? (
        <button type="button" className="text-primary hover:underline" onClick={onRetry}>重试</button>
      ) : null}
    </p>
  )
}
