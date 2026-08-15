import { useEffect, useMemo, useRef, useState } from 'react'
import { Tldraw } from 'tldraw'
import 'tldraw/tldraw.css'
import { X } from 'lucide-react'

import type { StructuredWhiteboardVisualRelation } from '../../../domain/structured/structured-projections'
import type {
  StructuredWhiteboardPosition,
  StructuredWhiteboardSnapshotV1,
} from '../../../domain/structured/structured-view-metadata'
import type {
  StructuredWhiteboardRelationEditorChrome,
  StructuredWhiteboardVisualRelationChip,
} from '../structured-whiteboard-relation-model'
import type { StructuredWhiteboardViewModel } from '../structured-whiteboard-view-model'
import type { StructuredWhiteboardSubjectOpenOptions } from '../useStructuredWhiteboardViewController'
import { LinxSubjectShapeUtil } from './linx-subject-shape'
import { LinxGroupShapeUtil } from './linx-group-shape'
import { LinxWhiteboardContextMenu } from './LinxWhiteboardContextMenu'
import { LinxWhiteboardToolbar } from './LinxWhiteboardToolbar'
import { useLinxWhiteboardController } from './useLinxWhiteboardController'

const tldrawLicenseKey = import.meta.env.VITE_TLDRAW_LICENSE_KEY?.trim() || undefined

type LinxWhiteboardCanvasRelationProps = {
  canSaveRelation?: boolean
  canSaveVisualRelation?: boolean
  hasVisualRelationChips?: boolean
  relationEditorChrome?: StructuredWhiteboardRelationEditorChrome
  relationEditorOpen?: boolean
  relationFrom?: string
  relationLabel?: string
  relationPredicate?: string
  relationPredicateOptions?: readonly string[]
  relationSaving?: boolean
  relationSaveError?: string | null
  relationSubjectOptions?: string[]
  relationTo?: string
  relationToOptions?: string[]
  visualRelationChips?: StructuredWhiteboardVisualRelationChip[]
  cancelRelationEditor?: () => void
  openRelationEditorFor?: (relation: StructuredWhiteboardVisualRelation) => void
  openRelationEditorBetween?: (from: string, to: string) => void
  removeVisualRelation?: (relationId: string) => void
  saveRelation?: () => boolean | Promise<boolean>
  updateRelationFrom?: (value: string) => void
  updateRelationLabel?: (value: string) => void
  updateRelationPredicate?: (value: string) => void
  updateRelationTo?: (value: string) => void
}

export function LinxWhiteboardCanvas({
  model,
  snapshot,
  onAddSubject,
  onCreateSubject,
  onClearSubjects,
  onNodePositionChange,
  onRemoveSubject,
  onSnapshotChange,
  onOpenRelationEditor,
  onOpenSubject,
  relation,
}: {
  model: StructuredWhiteboardViewModel
  snapshot?: StructuredWhiteboardSnapshotV1
  onAddSubject?: (subject: string) => void
  onCreateSubject?: (subject: string) => boolean | Promise<boolean>
  onClearSubjects?: () => void
  onNodePositionChange?: (subject: string, position: StructuredWhiteboardPosition) => void
  onRemoveSubject?: (subject: string) => void
  onSnapshotChange?: (snapshot: StructuredWhiteboardSnapshotV1) => void
  onOpenRelationEditor: () => void
  onOpenSubject?: (subject: string, options?: StructuredWhiteboardSubjectOpenOptions) => void
  relation?: LinxWhiteboardCanvasRelationProps
}) {
  const [contextMenu, setContextMenu] = useState<{ left: number; top: number; selectedCount: number } | null>(null)
  const [quickAddPlacement, setQuickAddPlacement] = useState<{
    page: StructuredWhiteboardPosition
    screen: { x: number; y: number }
  } | null>(null)
  const [quickAddOpen, setQuickAddOpen] = useState(false)
  const onOpenSubjectRef = useRef(onOpenSubject)
  const openRelationEditorBetweenRef = useRef(relation?.openRelationEditorBetween)
  onOpenSubjectRef.current = onOpenSubject
  openRelationEditorBetweenRef.current = relation?.openRelationEditorBetween
  const canvas = useLinxWhiteboardController({
    model,
    snapshot,
    onNodePositionChange,
    onRemoveSubject,
    onRestoreSubject: onAddSubject,
    onSnapshotChange,
  })
  const shapeUtils = useMemo(() => {
    class FilesLinxSubjectShapeUtil extends LinxSubjectShapeUtil {
      static override onOpenSubject = (subject: string, options?: StructuredWhiteboardSubjectOpenOptions) => (
        onOpenSubjectRef.current?.(subject, options)
      )
      static override onConnectSubject = (from: string, to: string) => (
        openRelationEditorBetweenRef.current?.(from, to)
      )
    }
    return [FilesLinxSubjectShapeUtil, LinxGroupShapeUtil]
  }, [])

  useEffect(() => {
    canvas.syncSnapshot()
  }, [canvas])

  useEffect(() => {
    let wasMobile = window.innerWidth < 640
    if (wasMobile) requestAnimationFrame(canvas.fitContent)
    const fitWhenEnteringMobile = () => {
      const isMobile = window.innerWidth < 640
      if (isMobile && !wasMobile) requestAnimationFrame(canvas.fitContent)
      wasMobile = isMobile
    }
    window.addEventListener('resize', fitWhenEnteringMobile)
    return () => window.removeEventListener('resize', fitWhenEnteringMobile)
  }, [canvas.fitContent])

  useEffect(() => {
    if (!contextMenu) return
    const close = () => setContextMenu(null)
    document.addEventListener('pointerdown', close)
    window.addEventListener('blur', close)
    return () => {
      document.removeEventListener('pointerdown', close)
      window.removeEventListener('blur', close)
    }
  }, [contextMenu])

  const runContextAction = (action: () => void) => {
    action()
    setContextMenu(null)
  }

  return (
    <div
      className="relative -mx-2 h-[calc(100vh-12rem)] min-h-[480px] overflow-hidden border-y border-border/10 bg-background"
      data-whiteboard-canvas-scroll="true"
      onKeyDownCapture={(event) => {
        const target = event.target as HTMLElement
        if (target.matches('input, textarea, [contenteditable="true"]')) return
        if (!(event.metaKey || event.ctrlKey) || event.altKey) return
        if (event.key.toLowerCase() === 'c') {
          event.preventDefault()
          canvas.copySelection()
          return
        }
        if (event.key.toLowerCase() === 'v') {
          event.preventDefault()
          canvas.pasteSelection()
        }
      }}
      onDoubleClick={(event) => {
        const target = event.target as HTMLElement
        if (target.closest('[data-whiteboard-subject-shape], [data-whiteboard-toolbar-scroll]')) return
        if (model.availableRows.length === 0 && !onCreateSubject) return
        event.preventDefault()
        const point = canvas.screenToPage({ x: event.clientX, y: event.clientY })
        setQuickAddPlacement({
          page: { x: Math.round(point.x), y: Math.round(point.y) },
          screen: { x: event.clientX, y: event.clientY },
        })
        setQuickAddOpen(true)
      }}
      onContextMenuCapture={(event) => {
        if ((event.target as HTMLElement).closest('[data-whiteboard-toolbar-scroll]')) return
        const selectedCount = canvas.selectedShapeCount()
        if (selectedCount === 0) return
        event.preventDefault()
        const bounds = event.currentTarget.getBoundingClientRect()
        setContextMenu({
          left: Math.max(8, Math.min(event.clientX - bounds.left, bounds.width - 176)),
          top: Math.max(8, Math.min(event.clientY - bounds.top, bounds.height - 320)),
          selectedCount,
        })
      }}
    >
      <Tldraw
        hideUi
        licenseKey={tldrawLicenseKey}
        onMount={canvas.handleMount}
        shapeUtils={shapeUtils}
        components={{
          ContextMenu: null,
          InFrontOfTheCanvas: () => (
            <LinxWhiteboardToolbar
              availableRows={model.availableRows}
              canClearSubjects={model.canClearSubjects}
              canCreateVisualRelation={model.canCreateVisualRelation}
              cardCountLabel={model.cardCountLabel}
              chrome={model.chrome}
              nodes={model.nodes}
              onAddSubject={(subject) => {
                onAddSubject?.(subject)
                if (quickAddPlacement) onNodePositionChange?.(subject, quickAddPlacement.page)
                setQuickAddPlacement(null)
                setQuickAddOpen(false)
              }}
              onCreateSubject={async (subject) => {
                if (!onCreateSubject) return false
                const created = await onCreateSubject(subject)
                if (created === false) return false
                if (quickAddPlacement) onNodePositionChange?.(subject, quickAddPlacement.page)
                setQuickAddPlacement(null)
                setQuickAddOpen(false)
                return true
              }}
              onQuickAddDismiss={() => {
                setQuickAddPlacement(null)
                setQuickAddOpen(false)
              }}
              onClearSubjects={onClearSubjects}
              onGroupSelection={canvas.groupSelection}
              onHandTool={canvas.handTool}
              onOpenRelationEditor={onOpenRelationEditor}
              onResetZoom={canvas.resetZoom}
              onSearchSubject={canvas.focusSubject}
              onSelectTool={canvas.selectTool}
              onZoomIn={canvas.zoomIn}
              onZoomOut={canvas.zoomOut}
              addMenuOpen={quickAddOpen}
              onAddMenuOpenChange={setQuickAddOpen}
              quickAddScreenPoint={quickAddPlacement?.screen}
            />
          ),
        }}
      />
      {contextMenu ? (
        <LinxWhiteboardContextMenu
          {...contextMenu}
          onAlignLeft={() => runContextAction(() => canvas.alignSelection('left'))}
          onBringToFront={() => runContextAction(canvas.bringSelectionToFront)}
          onDelete={() => runContextAction(canvas.deleteSelection)}
          onDistributeHorizontal={() => runContextAction(() => canvas.distributeSelection('horizontal'))}
          onDistributeVertical={() => runContextAction(() => canvas.distributeSelection('vertical'))}
          onDuplicate={() => runContextAction(canvas.duplicateSelection)}
          onGroup={() => runContextAction(canvas.groupSelection)}
          onRedo={() => runContextAction(canvas.redo)}
          onSendToBack={() => runContextAction(canvas.sendSelectionToBack)}
          onUndo={() => runContextAction(canvas.undo)}
        />
      ) : null}
      {model.isCanvasEmpty ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-4 text-center text-xs text-muted-foreground">
          {model.chrome.emptyCanvasMessage}
        </div>
      ) : null}
      {relation?.hasVisualRelationChips ? (
        <div className="absolute left-2 top-12 z-20 flex flex-wrap items-center gap-1 text-[11px] text-muted-foreground">
          {relation.visualRelationChips?.map((relationChip) => (
            <span
              key={relationChip.id}
              data-whiteboard-relation-source="visual"
              className="inline-flex overflow-hidden rounded border border-border/40 bg-background/95"
            >
              <button
                type="button"
                aria-label={relationChip.editAriaLabel}
                className="px-2 py-1 hover:bg-muted/70"
                onClick={() => relation.openRelationEditorFor?.(relationChip.relation)}
              >
                {relationChip.label}
              </button>
              <button
                type="button"
                aria-label={relationChip.deleteAriaLabel}
                className="inline-flex w-6 items-center justify-center border-l border-border/30 text-muted-foreground hover:bg-muted/70 hover:text-foreground"
                onClick={() => relation.removeVisualRelation?.(relationChip.id)}
              >
                <X className="h-3 w-3" aria-hidden="true" />
              </button>
            </span>
          ))}
        </div>
      ) : null}
      {relation?.relationEditorOpen && relation.relationEditorChrome ? (
        <form
          className="absolute right-3 top-12 z-20 grid w-[min(360px,calc(100%-1.5rem))] gap-2 rounded-md border border-border/40 bg-popover p-2 text-xs shadow-sm"
          onSubmit={(event) => {
            event.preventDefault()
            void relation.saveRelation?.()
          }}
        >
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="grid gap-1">
              <span className="text-[10px] font-medium uppercase text-muted-foreground">
                {relation.relationEditorChrome.fromFieldLabel}
              </span>
              <select
                aria-label={relation.relationEditorChrome.fromFieldAriaLabel}
                className="h-7 rounded border border-border/40 bg-background px-2 text-[11px] outline-none"
                value={relation.relationFrom}
                onChange={(event) => relation.updateRelationFrom?.(event.target.value)}
              >
                {relation.relationSubjectOptions?.map((subject) => (
                  <option key={subject} value={subject}>{subject}</option>
                ))}
              </select>
            </label>
            <label className="grid gap-1">
              <span className="text-[10px] font-medium uppercase text-muted-foreground">
                {relation.relationEditorChrome.toFieldLabel}
              </span>
              <select
                aria-label={relation.relationEditorChrome.toFieldAriaLabel}
                className="h-7 rounded border border-border/40 bg-background px-2 text-[11px] outline-none"
                value={relation.relationTo}
                onChange={(event) => relation.updateRelationTo?.(event.target.value)}
              >
                {relation.relationToOptions?.map((subject) => (
                  <option key={subject} value={subject}>{subject}</option>
                ))}
              </select>
            </label>
          </div>
          <label className="grid gap-1">
            <span className="text-[10px] font-medium uppercase text-muted-foreground">写入方式</span>
            <select
              aria-label="Relation predicate"
              className="h-7 rounded border border-border/40 bg-background px-2 text-[11px] outline-none"
              value={relation.relationPredicate}
              onChange={(event) => relation.updateRelationPredicate?.(event.target.value)}
            >
              <option value="">仅白板视觉关系</option>
              {relation.relationPredicateOptions?.map((predicate) => (
                <option key={predicate} value={predicate}>{predicate}</option>
              ))}
            </select>
          </label>
          {!relation.relationPredicate ? (
            <label className="grid gap-1">
              <span className="text-[10px] font-medium uppercase text-muted-foreground">
                {relation.relationEditorChrome.labelFieldLabel}
              </span>
              <input
                aria-label={relation.relationEditorChrome.labelFieldAriaLabel}
                className="h-7 rounded border border-border/40 bg-background px-2 text-[11px] outline-none"
                value={relation.relationLabel}
                onChange={(event) => relation.updateRelationLabel?.(event.target.value)}
                placeholder={relation.relationEditorChrome.labelFieldPlaceholder}
              />
            </label>
          ) : null}
          {relation.relationSaveError ? (
            <p role="alert" className="text-[10px] text-destructive">{relation.relationSaveError}</p>
          ) : null}
          <div className="flex items-center justify-end gap-1">
            <button
              type="button"
              aria-label={relation.relationEditorChrome.cancelButtonAriaLabel}
              className="h-7 rounded bg-muted px-2 text-[11px] text-foreground hover:bg-muted/70"
              onClick={relation.cancelRelationEditor}
            >
              {relation.relationEditorChrome.cancelButtonLabel}
            </button>
            <button
              type="submit"
              className="h-7 rounded bg-primary px-2 text-[11px] text-primary-foreground disabled:opacity-40"
              disabled={!relation.canSaveRelation}
            >
              {relation.relationSaving
                ? '提交中…'
                : relation.relationPredicate
                  ? '提交待确认关系'
                  : relation.relationEditorChrome.saveButtonLabel}
            </button>
          </div>
        </form>
      ) : null}
    </div>
  )
}
