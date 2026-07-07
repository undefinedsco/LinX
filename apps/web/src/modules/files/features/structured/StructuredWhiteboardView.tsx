import { MoreHorizontal, Plus, Trash2, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  type StructuredWhiteboardVisualRelation,
} from '../../domain/structured/structured-projections'
import type { StructuredTableProjection } from '../../domain/structured/structured-table'
import type { StructuredWhiteboardPosition } from '../../domain/structured/structured-view-metadata'
import {
  useStructuredWhiteboardViewController,
  type StructuredWhiteboardSubjectOpenOptions,
} from './useStructuredWhiteboardViewController'

const EMPTY_WHITEBOARD_LAYOUT: Record<string, { x: number; y: number }> = {}
const EMPTY_WHITEBOARD_SUBJECTS: string[] = []

export function StructuredWhiteboardView({
  documentUri,
  layout = EMPTY_WHITEBOARD_LAYOUT,
  projection,
  selectedSubjects = EMPTY_WHITEBOARD_SUBJECTS,
  visualRelations = [],
  onAddSubject,
  onRemoveSubject,
  onClearSubjects,
  onNodePositionChange,
  onVisualRelationsChange,
  onOpenSubject,
}: {
  documentUri: string
  layout?: Record<string, StructuredWhiteboardPosition>
  projection: StructuredTableProjection
  selectedSubjects?: string[]
  visualRelations?: StructuredWhiteboardVisualRelation[]
  onAddSubject?: (subject: string) => void
  onRemoveSubject?: (subject: string) => void
  onClearSubjects?: () => void
  onNodePositionChange?: (subject: string, position: StructuredWhiteboardPosition) => void
  onVisualRelationsChange?: (relations: StructuredWhiteboardVisualRelation[]) => void
  onOpenSubject?: (subject: string, options?: StructuredWhiteboardSubjectOpenOptions) => void
}) {
  const whiteboard = useStructuredWhiteboardViewController({
    documentUri,
    layout,
    projection,
    selectedSubjects,
    visualRelations,
    onNodePositionChange,
    onVisualRelationsChange,
    onOpenSubject,
  })

  return (
    <div className="space-y-2">
      <div
        className="flex min-w-0 items-center justify-between gap-2 overflow-x-auto"
        data-whiteboard-toolbar-scroll="actions"
      >
        <p className="shrink-0 text-[11px] text-muted-foreground">{whiteboard.cardCountLabel}</p>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label={whiteboard.chrome.toolsButtonAriaLabel}
              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted/70 hover:text-foreground"
              title={whiteboard.chrome.toolsButtonLabel}
            >
              <MoreHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              {whiteboard.chrome.addSubjectButtonAriaLabel}
            </DropdownMenuLabel>
            <div className="max-h-56 overflow-y-auto">
              {whiteboard.hasAvailableSubjectOptions ? whiteboard.availableRows.map((row) => (
                <DropdownMenuItem key={row.subject} onSelect={() => onAddSubject?.(row.subject)}>
                  {row.subject}
                </DropdownMenuItem>
              )) : (
                <DropdownMenuItem disabled>{whiteboard.chrome.noAvailableSubjectOptionsLabel}</DropdownMenuItem>
              )}
            </div>
            {whiteboard.canCreateVisualRelation ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={whiteboard.openRelationEditor}>
                  <Plus className="mr-2 h-3.5 w-3.5" aria-hidden="true" />
                  {whiteboard.chrome.addRelationButtonAriaLabel}
                </DropdownMenuItem>
              </>
            ) : null}
            {whiteboard.canClearSubjects ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => onClearSubjects?.()}>
                  <Trash2 className="mr-2 h-3.5 w-3.5" aria-hidden="true" />
                  {whiteboard.chrome.clearSubjectsButtonAriaLabel}
                </DropdownMenuItem>
              </>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {whiteboard.hasVisualRelationChips ? (
        <div className="flex flex-wrap items-center gap-1 text-[11px] text-muted-foreground">
          {whiteboard.visualRelationChips.map((relationChip) => (
            <span
              key={relationChip.id}
              className="inline-flex overflow-hidden rounded border border-border/40 bg-background"
            >
              <button
                type="button"
                aria-label={relationChip.editAriaLabel}
                className="px-2 py-1 hover:bg-muted/70"
                onClick={() => whiteboard.openRelationEditorFor(relationChip.relation)}
              >
                {relationChip.label}
              </button>
              <button
                type="button"
                aria-label={relationChip.deleteAriaLabel}
                className="inline-flex w-6 items-center justify-center border-l border-border/30 text-muted-foreground hover:bg-muted/70 hover:text-foreground"
                onClick={() => whiteboard.removeVisualRelation(relationChip.id)}
              >
                <X className="h-3 w-3" aria-hidden="true" />
              </button>
            </span>
          ))}
        </div>
      ) : null}
      <div
        ref={whiteboard.frameRef}
        className="relative -mx-2 min-h-[480px] overflow-auto border-y border-border/10 bg-background"
        data-whiteboard-canvas-scroll="true"
        data-whiteboard-layout-key={whiteboard.layoutKey}
      >
        {whiteboard.isCanvasEmpty ? (
          <div className="absolute inset-0 flex items-center justify-center px-4 text-center text-xs text-muted-foreground">
            {whiteboard.chrome.emptyCanvasMessage}
          </div>
        ) : null}
        <svg className="absolute inset-0 h-full w-full text-border" aria-hidden="true">
          {whiteboard.relationSegments.map((relation) => (
            <line
              key={relation.id}
              x1={relation.x1}
              y1={relation.y1}
              x2={relation.x2}
              y2={relation.y2}
              stroke="currentColor"
              strokeWidth="1"
              strokeDasharray={relation.strokeDasharray}
              data-whiteboard-relation-source={relation.source}
            />
          ))}
        </svg>
        {whiteboard.relationEditorOpen ? (
          <form
            className="absolute right-3 top-3 z-20 grid w-[min(360px,calc(100%-1.5rem))] gap-2 rounded-lg border border-border/40 bg-popover/95 p-2 text-xs shadow-sm backdrop-blur"
            onSubmit={(event) => {
              event.preventDefault()
              whiteboard.saveVisualRelation()
            }}
          >
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="grid gap-1">
                <span className="text-[10px] font-medium uppercase text-muted-foreground">
                  {whiteboard.relationEditorChrome.fromFieldLabel}
                </span>
                <select
                  aria-label={whiteboard.relationEditorChrome.fromFieldAriaLabel}
                  className="h-7 rounded border border-border/40 bg-background px-2 text-[11px] outline-none"
                  value={whiteboard.relationFrom}
                  onChange={(event) => whiteboard.updateRelationFrom(event.target.value)}
                >
                  {whiteboard.relationSubjectOptions.map((subject) => (
                    <option key={subject} value={subject}>{subject}</option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1">
                <span className="text-[10px] font-medium uppercase text-muted-foreground">
                  {whiteboard.relationEditorChrome.toFieldLabel}
                </span>
                <select
                  aria-label={whiteboard.relationEditorChrome.toFieldAriaLabel}
                  className="h-7 rounded border border-border/40 bg-background px-2 text-[11px] outline-none"
                  value={whiteboard.relationTo}
                  onChange={(event) => whiteboard.updateRelationTo(event.target.value)}
                >
                  {whiteboard.relationToOptions.map((subject) => (
                    <option key={subject} value={subject}>{subject}</option>
                  ))}
                </select>
              </label>
            </div>
            <label className="grid gap-1">
              <span className="text-[10px] font-medium uppercase text-muted-foreground">
                {whiteboard.relationEditorChrome.labelFieldLabel}
              </span>
              <input
                aria-label={whiteboard.relationEditorChrome.labelFieldAriaLabel}
                className="h-7 rounded border border-border/40 bg-background px-2 text-[11px] outline-none"
                value={whiteboard.relationLabel}
                onChange={(event) => whiteboard.updateRelationLabel(event.target.value)}
                placeholder={whiteboard.relationEditorChrome.labelFieldPlaceholder}
              />
            </label>
            <div className="flex items-center justify-end gap-1">
              <button
                type="button"
                aria-label={whiteboard.relationEditorChrome.cancelButtonAriaLabel}
                className="h-7 rounded bg-muted px-2 text-[11px] text-foreground hover:bg-muted/70"
                onClick={whiteboard.cancelRelationEditor}
              >
                {whiteboard.relationEditorChrome.cancelButtonLabel}
              </button>
              <button
                type="submit"
                className="h-7 rounded bg-primary px-2 text-[11px] text-primary-foreground disabled:opacity-40"
                disabled={!whiteboard.canSaveVisualRelation}
              >
                {whiteboard.relationEditorChrome.saveButtonLabel}
              </button>
            </div>
          </form>
        ) : null}
        {whiteboard.nodes.map((node) => (
          <div
            key={node.subject}
            role="button"
            tabIndex={0}
            aria-label={node.openAriaLabel}
            className={cn(
              'absolute w-44 cursor-grab rounded-lg border border-border/40 bg-background px-3 py-2 text-xs shadow-sm outline-none transition-colors hover:border-primary/30 focus-visible:ring-2 focus-visible:ring-primary/25 active:cursor-grabbing',
              whiteboard.isNodeDragging(node.subject) && 'ring-2 ring-primary/30',
            )}
            data-layout-x={node.x}
            data-layout-y={node.y}
            data-whiteboard-subject={node.subject}
            onPointerDown={(event) => whiteboard.startNodeDrag(event, node.subject)}
            onClick={() => whiteboard.handleNodeClick(node.subject)}
            onDoubleClick={(event) => whiteboard.handleNodeDoubleClick(event, node.subject)}
            onKeyDown={(event) => whiteboard.handleNodeKeyDown(event, node.subject)}
            style={{ left: node.x, top: node.y }}
          >
            <button
              type="button"
              aria-label={node.removeAriaLabel}
              className="absolute right-1 top-1 inline-flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation()
                onRemoveSubject?.(node.subject)
              }}
            >
              <X className="h-3 w-3" aria-hidden="true" />
            </button>
            <p className="truncate pr-5 font-medium text-foreground/85">{node.title}</p>
            <p className="mt-1 truncate text-[11px] text-muted-foreground">{node.className ?? node.subject}</p>
          </div>
        ))}
        {whiteboard.showRelationCount ? (
          <div className="absolute bottom-2 left-2 rounded bg-background/90 px-2 py-1 text-[10px] text-muted-foreground shadow-sm">
            {whiteboard.relationCountLabel}
          </div>
        ) : null}
      </div>
    </div>
  )
}
