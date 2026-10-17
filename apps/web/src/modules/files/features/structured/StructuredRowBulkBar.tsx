import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

import { projectStructuredBulkBar } from './structured-row-selection-model'

export interface StructuredBulkMoveTarget {
  id: string
  label: string
}

/** R6 K6: the small bar that appears once rows are ticked: 打开 / 删除… (asks first) / 移到…. */
export function StructuredRowBulkBar({
  count,
  moveTargets,
  onOpen,
  onDelete,
  onMove,
  onClear,
}: {
  count: number
  moveTargets: readonly StructuredBulkMoveTarget[]
  onOpen: () => void
  onDelete?: () => void | Promise<unknown>
  onMove?: (targetId: string) => void | Promise<unknown>
  onClear: () => void
}) {
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const model = projectStructuredBulkBar(count)

  return (
    <div
      role="toolbar"
      aria-label="选中的卡片"
      data-structured-bulk-bar="true"
      className="mb-1 flex items-center justify-between rounded-md border border-border/35 bg-muted/20 px-3 py-1.5"
    >
      <span className="text-xs font-medium text-foreground/80">{model.label}</span>
      <div className="flex items-center gap-1">
        <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={onOpen}>
          {model.openLabel}
        </Button>
        {onMove && moveTargets.length > 0 ? (
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-xs">
                {model.moveLabel}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {moveTargets.map((target) => (
                <DropdownMenuItem key={target.id} onSelect={() => { void onMove(target.id) }}>
                  {target.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
        {onDelete ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-xs text-destructive hover:text-destructive"
            onClick={() => setConfirmOpen(true)}
          >
            {model.deleteLabel}
          </Button>
        ) : null}
        <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-xs text-muted-foreground" onClick={onClear}>
          {model.clearLabel}
        </Button>
      </div>
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={model.confirmTitle}
        description={model.confirmDescription}
        confirmLabel={model.confirmLabel}
        destructive
        busy={busy}
        onConfirm={() => {
          setBusy(true)
          void Promise.resolve(onDelete?.()).finally(() => {
            setBusy(false)
            setConfirmOpen(false)
          })
        }}
      />
    </div>
  )
}
