import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import { createPortal } from 'react-dom'
import { Group, Hand, Link2, LocateFixed, Minus, MoreHorizontal, MousePointer2, Plus, Search, Trash2 } from 'lucide-react'

import type { StructuredTableRow } from '../../../domain/structured/structured-table'
import type { StructuredWhiteboardChrome, StructuredWhiteboardNode } from '../structured-whiteboard-view-model'

export function LinxWhiteboardToolbar({
  availableRows,
  canClearSubjects,
  canCreateVisualRelation,
  cardCountLabel,
  chrome,
  nodes,
  onAddSubject,
  onCreateSubject,
  onClearSubjects,
  onGroupSelection,
  onHandTool,
  onOpenRelationEditor,
  onQuickAddDismiss,
  onResetZoom,
  onSearchSubject,
  onSelectTool,
  onZoomIn,
  onZoomOut,
  quickAddRequestToken = 0,
  quickAddScreenPoint,
  addMenuOpen: controlledAddMenuOpen,
  onAddMenuOpenChange,
}: {
  availableRows: StructuredTableRow[]
  canClearSubjects: boolean
  canCreateVisualRelation: boolean
  cardCountLabel: string
  chrome: StructuredWhiteboardChrome
  nodes: StructuredWhiteboardNode[]
  onAddSubject?: (subject: string) => void
  onCreateSubject?: (subject: string) => boolean | Promise<boolean>
  onClearSubjects?: () => void
  onGroupSelection: () => void
  onHandTool: () => void
  onOpenRelationEditor: () => void
  onQuickAddDismiss?: () => void
  onSearchSubject: (subject: string) => void
  onSelectTool: () => void
  onZoomIn: () => void
  onZoomOut: () => void
  onResetZoom: () => void
  quickAddRequestToken?: number
  quickAddScreenPoint?: { x: number; y: number }
  addMenuOpen?: boolean
  onAddMenuOpenChange?: Dispatch<SetStateAction<boolean>>
}) {
  const [query, setQuery] = useState('')
  const [addQuery, setAddQuery] = useState('')
  const [addError, setAddError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [internalAddMenuOpen, setInternalAddMenuOpen] = useState(false)
  const addMenuOpen = controlledAddMenuOpen ?? internalAddMenuOpen
  const setAddMenuOpen = onAddMenuOpenChange ?? setInternalAddMenuOpen
  const [moreMenuOpen, setMoreMenuOpen] = useState(false)
  const toolbarRef = useRef<HTMLDivElement | null>(null)
  const addMenuRef = useRef<HTMLDivElement | null>(null)
  const hasOpenFlyout = searchOpen || addMenuOpen || moreMenuOpen

  useEffect(() => {
    if (quickAddRequestToken === 0) return
    setSearchOpen(false)
    setMoreMenuOpen(false)
    setAddMenuOpen(true)
  }, [quickAddRequestToken, setAddMenuOpen])

  useEffect(() => {
    if (!hasOpenFlyout) return
    const dismissFlyouts = (event: PointerEvent) => {
      if (toolbarRef.current?.contains(event.target as Node)) return
      if (addMenuRef.current?.contains(event.target as Node)) return
      setSearchOpen(false)
      setAddMenuOpen(false)
      setMoreMenuOpen(false)
      onQuickAddDismiss?.()
    }
    document.addEventListener('pointerdown', dismissFlyouts)
    return () => document.removeEventListener('pointerdown', dismissFlyouts)
  }, [hasOpenFlyout, onQuickAddDismiss, setAddMenuOpen])
  const normalizedQuery = query.trim().toLowerCase()
  const matchedNodes = useMemo(
    () => normalizedQuery
      ? nodes.filter((node) => `${node.title} ${node.subject}`.toLowerCase().includes(normalizedQuery)).slice(0, 4)
      : [],
    [nodes, normalizedQuery],
  )
  const normalizedAddQuery = addQuery.trim().toLowerCase()
  const rowLabel = (row: StructuredTableRow) => projectWhiteboardRowLabel(row)
  const matchedRows = useMemo(
    () => normalizedAddQuery
      ? availableRows.filter((row) => `${rowLabel(row)} ${row.subject}`.toLowerCase().includes(normalizedAddQuery)).slice(0, 8)
      : availableRows.slice(0, 8),
    [availableRows, normalizedAddQuery],
  )
  const createSubject = async () => {
    const subject = addQuery.trim()
    if (!subject || !onCreateSubject || creating) return
    setCreating(true)
    setAddError(null)
    try {
      const created = await onCreateSubject(subject)
      if (created === false) {
        setAddError('创建失败，请重试')
        return
      }
      setAddQuery('')
      setAddMenuOpen(false)
    } catch {
      setAddError('创建失败，请重试')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div
      ref={toolbarRef}
      className="pointer-events-none absolute inset-x-2 top-2 flex min-w-0 items-start justify-between gap-2"
      data-whiteboard-toolbar-scroll="actions"
    >
      <div className="pointer-events-auto relative flex items-center gap-0.5 rounded-md border border-border/25 bg-background/92 p-0.5 shadow-sm backdrop-blur">
        <button
          type="button"
          aria-label="选择工具"
          title="选择"
          className="inline-flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-muted/70 hover:text-foreground"
          onClick={onSelectTool}
        >
          <MousePointer2 className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
        <button
          type="button"
          aria-label="平移工具"
          title="平移"
          className="inline-flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-muted/70 hover:text-foreground"
          onClick={onHandTool}
        >
          <Hand className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
        <button
          type="button"
          aria-label={chrome.addSubjectButtonAriaLabel}
          className="inline-flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-muted/70 hover:text-foreground disabled:opacity-35"
          title={`${chrome.addSubjectButtonLabel} · ${cardCountLabel}`}
          disabled={availableRows.length === 0 && !onCreateSubject}
          onPointerDown={(event) => {
            event.stopPropagation()
            onQuickAddDismiss?.()
            setAddMenuOpen(true)
          }}
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => {
            if (event.key !== 'Enter' && event.key !== ' ') return
            event.preventDefault()
            event.stopPropagation()
            onQuickAddDismiss?.()
            setAddMenuOpen(true)
          }}
        >
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
        {addMenuOpen ? createPortal(
          <div
            ref={addMenuRef}
            role="dialog"
            aria-label="快速添加 Subject"
            className="fixed z-[100] grid min-w-52 gap-0.5 rounded-md border border-border/35 bg-popover p-1 shadow-md"
            style={quickAddScreenPoint
              ? { left: quickAddScreenPoint.x, top: quickAddScreenPoint.y }
              : (() => {
                  const trigger = toolbarRef.current?.getBoundingClientRect()
                  return { left: trigger?.left ?? 8, top: (trigger?.bottom ?? 0) + 6 }
                })()}
          >
            <input
              autoFocus
              aria-label="搜索或新建 Subject"
              className="h-7 rounded border border-border/30 bg-background px-2 text-[11px] outline-none focus:border-primary/40"
              placeholder="搜索或新建 Subject"
              value={addQuery}
              onChange={(event) => {
                setAddQuery(event.target.value)
                setAddError(null)
              }}
              onKeyDown={(event) => {
                if (event.key !== 'Enter') return
                event.preventDefault()
                void createSubject()
              }}
            />
            {matchedRows.map((row) => (
              <button
                key={row.subject}
                type="button"
                aria-label={`添加 ${rowLabel(row)}`}
                className="grid min-h-9 rounded px-2 py-1 text-left hover:bg-muted"
                onClick={() => {
                  onAddSubject?.(row.subject)
                  setAddQuery('')
                  setAddMenuOpen(false)
                }}
              >
                <span className="truncate text-[11px] text-foreground">{rowLabel(row)}</span>
                {rowLabel(row) !== row.subject ? (
                  <span className="truncate text-[10px] text-muted-foreground">{row.subject}</span>
                ) : null}
              </button>
            ))}
            {onCreateSubject && addQuery.trim() && !matchedRows.some((row) => row.subject === addQuery.trim()) ? (
              <button
                type="button"
                className="h-7 truncate rounded px-2 text-left text-[11px] hover:bg-muted disabled:opacity-40"
                disabled={creating}
                onClick={() => void createSubject()}
              >
                {creating ? '创建中…' : `新建 ${addQuery.trim()}`}
              </button>
            ) : null}
            {addError ? <p className="px-2 py-1 text-[10px] text-destructive">{addError}</p> : null}
          </div>,
          document.body,
        ) : null}
        <button
          type="button"
          aria-label={chrome.addRelationButtonAriaLabel}
          className="inline-flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-muted/70 hover:text-foreground disabled:opacity-35"
          title={chrome.addRelationButtonLabel}
          disabled={!canCreateVisualRelation}
          onClick={onOpenRelationEditor}
        >
          <Link2 className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
        <button
          type="button"
          aria-label="组合所选内容"
          title="组合"
          className="inline-flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-muted/70 hover:text-foreground"
          onClick={onGroupSelection}
        >
          <Group className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
        <button
          type="button"
          aria-label="搜索白板 subject"
          title="搜索"
          className="inline-flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-muted/70 hover:text-foreground"
          onClick={() => setSearchOpen((open) => !open)}
        >
          <Search className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
        {searchOpen ? (
          <div className="absolute left-0 top-9 z-30 w-60 rounded-md border border-border/35 bg-popover p-1 shadow-md">
            <div className="relative flex items-center">
              <Search className="pointer-events-none absolute left-2 h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
              <input
                autoFocus
                type="search"
                aria-label="搜索白板 subject"
                className="h-7 w-full rounded border border-border/30 bg-background pl-7 pr-2 text-[11px] outline-none focus:border-primary/40"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>
            {matchedNodes.length > 0 ? (
              <div className="mt-1 grid gap-0.5">
                {matchedNodes.map((node) => (
                  <button
                    key={node.subject}
                    type="button"
                    aria-label={`定位 ${node.title}`}
                    className="h-7 rounded px-2 text-left text-[11px] hover:bg-muted"
                    onClick={() => {
                      onSearchSubject(node.subject)
                      setSearchOpen(false)
                    }}
                  >
                    {node.title}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
      <div className="pointer-events-auto relative flex items-center gap-0.5 rounded-md border border-border/25 bg-background/92 p-0.5 shadow-sm backdrop-blur">
        <button
          type="button"
          aria-label="放大白板"
          title="放大"
          className="inline-flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-muted/70 hover:text-foreground"
          onClick={onZoomIn}
        >
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
        <button
          type="button"
          aria-label="缩小白板"
          title="缩小"
          className="inline-flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-muted/70 hover:text-foreground"
          onClick={onZoomOut}
        >
          <Minus className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
        <button
          type="button"
          aria-label="重置白板缩放"
          title="重置缩放"
          className="inline-flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-muted/70 hover:text-foreground"
          onClick={onResetZoom}
        >
          <LocateFixed className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
        {canClearSubjects ? (
          <button
            type="button"
            aria-label="更多白板操作"
            title="更多"
            className="inline-flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-muted/70 hover:text-foreground"
            onClick={() => setMoreMenuOpen((open) => !open)}
          >
            <MoreHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        ) : null}
        {moreMenuOpen ? (
          <div className="absolute right-0 top-9 z-30 min-w-36 rounded-md border border-border/35 bg-popover p-1 shadow-md">
            <button
              type="button"
              aria-label={chrome.clearSubjectsButtonAriaLabel}
              className="flex h-7 w-full items-center gap-2 rounded px-2 text-left text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground"
              onClick={() => {
                onClearSubjects?.()
                setMoreMenuOpen(false)
              }}
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              {chrome.clearSubjectsButtonLabel}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  )
}

function projectWhiteboardRowLabel(row: StructuredTableRow) {
  const titleCell = row.cells.find((cell) => (
    cell.predicate === 'schema:name'
    || cell.predicate === 'name'
    || cell.predicate === 'title'
    || cell.predicate.endsWith('#name')
    || cell.predicate.endsWith('/name')
    || cell.predicate.endsWith('#title')
    || cell.predicate.endsWith('/title')
    || cell.predicate.endsWith(':title')
  ))
  const value = titleCell?.values[0]?.trim()
  if (!value) return row.subject
  return value
    .replace(/^"/, '')
    .replace(/"(?:@[a-z-]+|\^\^.+)?$/i, '')
}
