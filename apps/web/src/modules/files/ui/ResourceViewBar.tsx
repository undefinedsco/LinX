import type { ComponentType, ReactNode } from 'react'
import { Plus } from 'lucide-react'

import { cn } from '@/lib/utils'

export type ResourceViewBarIcon = ComponentType<{ className?: string; 'aria-hidden'?: boolean }>

export type ResourceViewBarView<ViewId extends string = string> = {
  id: ViewId
  label: string
  icon: ResourceViewBarIcon
}

export type ResourceViewBarProps<ViewId extends string = string> = {
  ariaLabel: string
  views: readonly ResourceViewBarView<ViewId>[]
  activeViewId: ViewId
  addViewLabel: string
  onSelectView: (viewId: ViewId) => void
  onAddView?: () => void
  addViewControl?: ReactNode
  rightActions?: ReactNode
  className?: string
  children?: ReactNode
  'data-control-placement'?: string
}

export function ResourceViewBar<ViewId extends string = string>({
  ariaLabel,
  views,
  activeViewId,
  addViewLabel,
  onSelectView,
  onAddView,
  addViewControl,
  rightActions,
  className,
  children,
  'data-control-placement': controlPlacement,
}: ResourceViewBarProps<ViewId>) {
  return (
    <div
      role="toolbar"
      aria-label={ariaLabel}
      data-resource-view-bar="true"
      data-control-placement={controlPlacement}
      className={cn('flex h-10 min-w-0 items-center gap-1 overflow-hidden border-b border-border/30', className)}
    >
      {children ?? <><div
        aria-label="View options"
        data-resource-view-bar-section="views"
        className="order-1 flex min-w-0 items-center gap-0.5 overflow-x-auto"
      >
        {views.map((view) => {
          const ViewIcon = view.icon
          const active = view.id === activeViewId
          return (
            <button
              key={view.id}
              type="button"
              aria-label={view.label}
              aria-pressed={active}
              title={view.label}
              className={cn(
                'flex h-7 shrink-0 items-center gap-1.5 rounded px-2 text-[11px] transition-colors',
                active ? 'bg-muted text-foreground' : 'text-muted-foreground hover:bg-muted/70 hover:text-foreground',
              )}
              onClick={() => onSelectView(view.id)}
            >
              <ViewIcon className="h-3.5 w-3.5" aria-hidden />
              {view.label}
            </button>
          )
        })}
        {addViewControl ?? (
          <button
            type="button"
            aria-label={addViewLabel}
            title={addViewLabel}
            className="flex h-7 shrink-0 items-center justify-center rounded px-2 text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground disabled:opacity-45"
            disabled={!onAddView}
            onClick={onAddView}
          >
            <Plus className="h-3 w-3" aria-hidden />
          </button>
        )}
      </div>
      {rightActions ? (
        <div
          aria-label="Resource view actions"
          data-resource-view-bar-section="actions"
          className="order-[3] ml-auto flex min-w-0 shrink-0 items-center gap-1"
        >
          {rightActions}
        </div>
      ) : null}</>}
    </div>
  )
}
