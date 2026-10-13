import '@xyflow/react/dist/style.css'

import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from 'react'
import {
  Background,
  ConnectionMode,
  Controls,
  MiniMap,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  useStore,
  type Connection,
  type EdgeChange,
  type NodeChange,
} from '@xyflow/react'

import { useCardDialog } from '@/lib/card-dialog'
import type { StructuredCardProjection } from '../../../domain/structured/structured-projections'
import {
  WHITEBOARD_CARD_DEFAULT_SIZE,
  WHITEBOARD_SECTION_COLORS,
  WHITEBOARD_SECTION_DEFAULT_SIZE,
  WHITEBOARD_TEXT_DEFAULT_SIZE,
  createWhiteboardCanvasId,
  createWhiteboardCardNode,
  resolveWhiteboardCardNodeUri,
  resolveWhiteboardSubjectUri,
  type WhiteboardCanvas,
  type WhiteboardCanvasNode,
  type WhiteboardCanvasSide,
} from '../../../domain/structured/structured-whiteboard-canvas'
import type { StructuredWhiteboardViewModel } from '../structured-whiteboard-view-model'
import type { useWhiteboardCanvasState } from './useWhiteboardCanvasState'
import {
  WhiteboardCardNode,
  WhiteboardNodeContext,
  WhiteboardSectionNode,
  type WhiteboardNodeActions,
} from './WhiteboardNodes'
import {
  WHITEBOARD_LIBRARY_DRAG_TYPE,
  WhiteboardLibraryPanel,
  type WhiteboardLibraryItem,
} from './WhiteboardLibraryPanel'
import { WhiteboardFilesSource } from './WhiteboardFilesSource'
import { WhiteboardRelationPicker } from './WhiteboardRelationPicker'
import { WhiteboardToolbar, type WhiteboardTool } from './WhiteboardToolbar'
import {
  WHITEBOARD_SIDES,
  addCanvasEdge,
  addCanvasNode,
  fileNameFromUri,
  moveCanvasNodes,
  nodesInsideSection,
  patchCanvasNode,
  removeCanvasEdges,
  removeCanvasNodes,
  toFlowEdges,
  toFlowNodes,
  type WhiteboardCardContent,
} from './whiteboard-flow'

const NODE_TYPES = { card: WhiteboardCardNode, section: WhiteboardSectionNode }

export type WhiteboardCanvasState = ReturnType<typeof useWhiteboardCanvasState>

export interface LinxWhiteboardRelationController {
  relationPredicateOptions?: readonly string[]
  relationSaveError?: string | null
  openRelationEditorBetween?: (from: string, to: string) => void
  updateRelationPredicate?: (value: string) => void
  relationFrom?: string
  relationTo?: string
  relationPredicate?: string
  saveRelation?: () => boolean | Promise<boolean>
  cancelRelationEditor?: () => void
}

export interface LinxWhiteboardCanvasProps {
  documentUri: string
  model: StructuredWhiteboardViewModel
  cards: readonly StructuredCardProjection[]
  canvasState: WhiteboardCanvasState
  relation?: LinxWhiteboardRelationController
  onCommitCardBody?: (subject: string, markdown: string) => void | Promise<void>
}

function isSide(value: string | null | undefined): value is WhiteboardCanvasSide {
  return WHITEBOARD_SIDES.includes(value as WhiteboardCanvasSide)
}

const STATUS_TEXT: Partial<Record<WhiteboardCanvasState['status'], string>> = {
  saved: '已保存到你的空间',
  saving: '正在保存…',
}

export function LinxWhiteboardCanvas(props: LinxWhiteboardCanvasProps) {
  return (
    <ReactFlowProvider>
      <WhiteboardCanvasInner {...props} />
    </ReactFlowProvider>
  )
}

function ZoomPercent() {
  const zoom = useStore((state) => state.transform[2])
  return <span className="rounded-md bg-card px-2 py-1 text-xs text-muted-foreground shadow">{Math.round(zoom * 100)}%</span>
}

function WhiteboardCanvasInner({
  documentUri,
  model,
  cards,
  canvasState,
  relation,
  onCommitCardBody,
}: LinxWhiteboardCanvasProps) {
  const { canvas, updateCanvas, status, conflict, takeLatest, keepMine, podRootUri } = canvasState
  const flow = useReactFlow()
  const openCardDialog = useCardDialog((state) => state.open)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ id: string; origin: Map<string, { x: number; y: number }>; start: { x: number; y: number } } | null>(null)
  const canvasRef = useRef(canvas)
  canvasRef.current = canvas

  const [tool, setTool] = useState<WhiteboardTool>('select')
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(() => new Set())
  const [editingId, setEditingId] = useState<string | null>(null)
  const [libraryTab, setLibraryTab] = useState<'cards' | 'files'>('cards')
  const [libraryOpen, setLibraryOpen] = useState(() => canvas.nodes.length === 0)
  const [picker, setPicker] = useState<{ edgeId: string; left: number; top: number } | null>(null)
  const [pendingRelation, setPendingRelation] = useState<{ edgeId: string; from: string; to: string; predicate: string } | null>(null)

  // --- what each canvas node shows --------------------------------------------------
  const cardByUri = useMemo(() => {
    const map = new Map<string, StructuredCardProjection>()
    for (const card of cards) map.set(resolveWhiteboardSubjectUri(card.subject, documentUri), card)
    return map
  }, [cards, documentUri])
  const documentBase = documentUri.split('#')[0]

  const contentOf = useCallback((node: WhiteboardCanvasNode): WhiteboardCardContent => {
    if (node.type === 'text') {
      return { kind: 'text', title: '', body: node.text, className: null, state: 'ok', uri: null, subject: null }
    }
    const uri = resolveWhiteboardCardNodeUri(node, podRootUri)
    if (!uri) return { kind: 'file', title: '', body: '', className: null, state: 'ok', uri: null, subject: null }
    const card = cardByUri.get(uri)
    if (card) {
      return { kind: 'row', title: card.title, body: card.summary, className: card.className, state: 'ok', uri, subject: card.subject }
    }
    if (uri.split('#')[0] === documentBase && uri.includes('#')) {
      return { kind: 'row', title: '', body: '', className: null, state: 'deleted', uri, subject: null }
    }
    return { kind: 'file', title: fileNameFromUri(uri), body: '', className: null, state: 'ok', uri, subject: null }
  }, [cardByUri, documentBase, podRootUri])

  const nodeIdBySubject = useMemo(() => {
    const map = new Map<string, string>()
    for (const node of canvas.nodes) {
      const content = contentOf(node)
      if (content.subject) map.set(content.subject, node.id)
    }
    return map
  }, [canvas.nodes, contentOf])

  const flowNodes = useMemo(() => toFlowNodes(canvas, contentOf, selectedIds), [canvas, contentOf, selectedIds])
  const flowEdges = useMemo(
    () => toFlowEdges(canvas, model.relations, nodeIdBySubject),
    [canvas, model.relations, nodeIdBySubject],
  )

  // --- editing -------------------------------------------------------------------------
  const commitBody = useCallback((id: string, markdown: string) => {
    const node = canvasRef.current.nodes.find((candidate) => candidate.id === id)
    setEditingId(null)
    if (!node) return
    if (node.type === 'text') {
      updateCanvas((current) => patchCanvasNode(current, id, { text: markdown }))
      return
    }
    const content = contentOf(node)
    if (content.subject) void onCommitCardBody?.(content.subject, markdown)
  }, [contentOf, onCommitCardBody, updateCanvas])

  const cardUrisInOrder = useCallback(() => (
    [...canvasRef.current.nodes]
      .map((node) => contentOf(node))
      .filter((content) => content.uri && content.state === 'ok')
      .map((content) => content.uri as string)
  ), [contentOf])

  const openCard = useCallback((id: string) => {
    const node = canvasRef.current.nodes.find((candidate) => candidate.id === id)
    if (!node) return
    const uri = contentOf(node).uri
    if (!uri) return
    openCardDialog({ uri, siblings: cardUrisInOrder(), from: 'whiteboard' })
  }, [cardUrisInOrder, contentOf, openCardDialog])

  const actions = useMemo<WhiteboardNodeActions>(() => ({
    editingId,
    connecting: tool === 'connect',
    startEdit: setEditingId,
    stopEdit: () => setEditingId(null),
    commitBody,
    openCard,
    renameSection: (id, label) => updateCanvas((current) => patchCanvasNode(current, id, { label })),
    recolorSection: (id, color) => updateCanvas((current) => patchCanvasNode(current, id, { color })),
    canEdit: (id) => {
      const node = canvasRef.current.nodes.find((candidate) => candidate.id === id)
      if (!node) return false
      if (node.type === 'text') return true
      return Boolean(onCommitCardBody && contentOf(node).subject)
    },
  }), [commitBody, contentOf, editingId, onCommitCardBody, openCard, tool, updateCanvas])

  // --- node / edge changes from React Flow -----------------------------------------
  const onNodesChange = useCallback((changes: NodeChange[]) => {
    const removed = new Set<string>()
    const selection = { next: null as Set<string> | null }
    for (const change of changes) {
      if (change.type === 'select') {
        selection.next ??= new Set(selectedIds)
        if (change.selected) selection.next.add(change.id)
        else selection.next.delete(change.id)
      } else if (change.type === 'remove') {
        removed.add(change.id)
      } else if (change.type === 'position' && change.position) {
        const current = canvasRef.current
        const target = current.nodes.find((node) => node.id === change.id)
        if (!target) continue
        if (change.dragging) {
          if (!dragRef.current || dragRef.current.id !== change.id) {
            const inside = target.type === 'group' ? nodesInsideSection(current, target.id) : []
            const origin = new Map<string, { x: number; y: number }>()
            for (const id of [target.id, ...inside]) {
              const node = current.nodes.find((candidate) => candidate.id === id)
              if (node) origin.set(id, { x: node.x, y: node.y })
            }
            dragRef.current = { id: change.id, origin, start: { x: target.x, y: target.y } }
          }
          const drag = dragRef.current
          const dx = change.position.x - drag.start.x
          const dy = change.position.y - drag.start.y
          const moves = new Map<string, { x: number; y: number }>()
          drag.origin.forEach((origin, id) => moves.set(id, { x: origin.x + dx, y: origin.y + dy }))
          updateCanvas((existing) => moveCanvasNodes(existing, moves))
        } else {
          dragRef.current = null
          updateCanvas((existing) => moveCanvasNodes(existing, new Map([[change.id, change.position as { x: number; y: number }]])))
        }
      } else if (change.type === 'dimensions' && change.setAttributes && change.dimensions) {
        const { width, height } = change.dimensions
        updateCanvas((existing) => patchCanvasNode(existing, change.id, { width: Math.round(width), height: Math.round(height) }))
      }
    }
    if (selection.next) setSelectedIds(selection.next)
    if (removed.size > 0) updateCanvas((existing) => removeCanvasNodes(existing, removed))
  }, [selectedIds, updateCanvas])

  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    const removed = new Set(changes.filter((change) => change.type === 'remove').map((change) => change.id))
    if (removed.size > 0) updateCanvas((existing) => removeCanvasEdges(existing, removed))
  }, [updateCanvas])

  // --- adding things -------------------------------------------------------------------
  const takenIds = () => new Set([...canvasRef.current.nodes.map((n) => n.id), ...canvasRef.current.edges.map((e) => e.id)])

  const viewportCenter = useCallback(() => {
    const bounds = wrapperRef.current?.getBoundingClientRect()
    return flow.screenToFlowPosition({
      x: (bounds?.left ?? 0) + (bounds?.width ?? 600) / 2,
      y: (bounds?.top ?? 0) + (bounds?.height ?? 400) / 2,
    })
  }, [flow])

  const addTextNode = useCallback((at?: { x: number; y: number }, size: { width: number; height: number } = WHITEBOARD_CARD_DEFAULT_SIZE) => {
    const point = at ?? viewportCenter()
    const id = createWhiteboardCanvasId('text', takenIds())
    updateCanvas((current) => addCanvasNode(current, {
      id, type: 'text', text: '', x: Math.round(point.x), y: Math.round(point.y), width: size.width, height: size.height,
    }))
    setSelectedIds(new Set([id]))
    setEditingId(id)
  }, [updateCanvas, viewportCenter])

  const addCardByUri = useCallback((uri: string, at?: { x: number; y: number }) => {
    const point = at ?? viewportCenter()
    const exists = canvasRef.current.nodes.some((node) => resolveWhiteboardCardNodeUri(node, podRootUri) === uri)
    // The same card may sit on a board twice only when dropped on purpose; keep an offset.
    const offset = exists ? 24 : 0
    const id = createWhiteboardCanvasId('card', takenIds())
    updateCanvas((current) => addCanvasNode(current, createWhiteboardCardNode({
      id, cardUri: uri, podRootUri, position: { x: point.x + offset, y: point.y + offset },
    })))
  }, [podRootUri, updateCanvas, viewportCenter])

  const addSection = useCallback(() => {
    const picked = canvasRef.current.nodes.filter((node) => selectedIds.has(node.id) && node.type !== 'group')
    const id = createWhiteboardCanvasId('section', takenIds())
    const color = WHITEBOARD_SECTION_COLORS[canvasRef.current.nodes.filter((n) => n.type === 'group').length % WHITEBOARD_SECTION_COLORS.length]
    let geometry: { x: number; y: number; width: number; height: number }
    if (picked.length > 0) {
      const left = Math.min(...picked.map((n) => n.x))
      const top = Math.min(...picked.map((n) => n.y))
      const right = Math.max(...picked.map((n) => n.x + n.width))
      const bottom = Math.max(...picked.map((n) => n.y + n.height))
      geometry = { x: left - 24, y: top - 40, width: right - left + 48, height: bottom - top + 64 }
    } else {
      const center = viewportCenter()
      geometry = {
        x: Math.round(center.x - WHITEBOARD_SECTION_DEFAULT_SIZE.width / 2),
        y: Math.round(center.y - WHITEBOARD_SECTION_DEFAULT_SIZE.height / 2),
        ...WHITEBOARD_SECTION_DEFAULT_SIZE,
      }
    }
    updateCanvas((current) => addCanvasNode(current, { id, type: 'group', label: '新区块', color, ...geometry }))
  }, [selectedIds, updateCanvas, viewportCenter])

  const onDrop = useCallback((event: DragEvent) => {
    const raw = event.dataTransfer.getData(WHITEBOARD_LIBRARY_DRAG_TYPE)
    if (!raw) return
    event.preventDefault()
    try {
      const item = JSON.parse(raw) as WhiteboardLibraryItem
      addCardByUri(item.uri, flow.screenToFlowPosition({ x: event.clientX, y: event.clientY }))
    } catch {
      // Ignore drags that are not from the card library.
    }
  }, [addCardByUri, flow])

  // --- connecting ----------------------------------------------------------------------
  const onConnect = useCallback((connection: Connection) => {
    if (!connection.source || !connection.target || connection.source === connection.target) return
    const id = createWhiteboardCanvasId('edge', takenIds())
    updateCanvas((current) => addCanvasEdge(current, {
      id,
      fromNode: connection.source,
      toNode: connection.target,
      ...(isSide(connection.sourceHandle) ? { fromSide: connection.sourceHandle } : {}),
      ...(isSide(connection.targetHandle) ? { toSide: connection.targetHandle } : {}),
      toEnd: 'arrow',
    }))
    const a = flow.getInternalNode(connection.source)
    const b = flow.getInternalNode(connection.target)
    const mid = a && b
      ? { x: (a.internals.positionAbsolute.x + b.internals.positionAbsolute.x) / 2 + (b.measured.width ?? 0) / 2, y: (a.internals.positionAbsolute.y + b.internals.positionAbsolute.y) / 2 }
      : viewportCenter()
    const screen = flow.flowToScreenPosition(mid)
    const bounds = wrapperRef.current?.getBoundingClientRect()
    setPicker({ edgeId: id, left: Math.max(8, screen.x - (bounds?.left ?? 0)), top: Math.max(8, screen.y - (bounds?.top ?? 0)) })
    setTool('select')
  }, [flow, updateCanvas, viewportCenter])

  const pickerEdge = picker ? canvas.edges.find((edge) => edge.id === picker.edgeId) : null
  const pickerSubjects = useMemo(() => {
    if (!pickerEdge) return null
    const from = canvas.nodes.find((n) => n.id === pickerEdge.fromNode)
    const to = canvas.nodes.find((n) => n.id === pickerEdge.toNode)
    const fromSubject = from ? contentOf(from).subject : null
    const toSubject = to ? contentOf(to).subject : null
    return fromSubject && toSubject ? { from: fromSubject, to: toSubject } : null
  }, [canvas.nodes, contentOf, pickerEdge])

  const chooseRelation = (predicate: string) => {
    if (!picker || !pickerSubjects || !relation?.openRelationEditorBetween) return
    relation.openRelationEditorBetween(pickerSubjects.from, pickerSubjects.to)
    relation.updateRelationPredicate?.(predicate)
    setPendingRelation({ edgeId: picker.edgeId, from: pickerSubjects.from, to: pickerSubjects.to, predicate })
  }

  // Write the relation once the controller holds the chosen cards and property.
  useEffect(() => {
    if (!pendingRelation || !relation) return
    if (relation.relationFrom !== pendingRelation.from
      || relation.relationTo !== pendingRelation.to
      || relation.relationPredicate !== pendingRelation.predicate) return
    const { edgeId } = pendingRelation
    setPendingRelation(null)
    void (async () => {
      const saved = await relation.saveRelation?.()
      if (saved === false) return
      updateCanvas((current) => removeCanvasEdges(current, new Set([edgeId])))
      setPicker(null)
    })()
  }, [pendingRelation, relation, updateCanvas])

  // --- keyboard, double click ------------------------------------------------------------
  const selectedCardIds = [...selectedIds].filter((id) => canvas.nodes.some((n) => n.id === id && n.type !== 'group'))

  const onKeyDown = (event: React.KeyboardEvent) => {
    const target = event.target as HTMLElement
    if (target.closest('input, textarea, [contenteditable="true"], [data-whiteboard-body-editor]')) return
    if (event.key === ' ' && selectedCardIds.length === 1) {
      event.preventDefault()
      openCard(selectedCardIds[0])
    }
  }

  const onDoubleClick = (event: React.MouseEvent) => {
    const target = event.target as HTMLElement
    if (!target.classList.contains('react-flow__pane')) return
    addTextNode(flow.screenToFlowPosition({ x: event.clientX, y: event.clientY }))
  }

  // --- library ----------------------------------------------------------------------------
  const libraryCards = useMemo<WhiteboardLibraryItem[]>(() => {
    const onBoard = new Set([...nodeIdBySubject.keys()])
    return cards
      .filter((card) => !onBoard.has(card.subject))
      .map((card) => ({
        uri: resolveWhiteboardSubjectUri(card.subject, documentUri),
        title: card.title || '未命名卡片',
        subtitle: card.summary || card.className || undefined,
      }))
  }, [cards, documentUri, nodeIdBySubject])

  const findItems = useMemo(() => canvas.nodes
    .filter((node) => node.type !== 'group')
    .map((node) => {
      const content = contentOf(node)
      return { id: node.id, title: content.title || content.body.slice(0, 24) || '空白卡片' }
    }), [canvas.nodes, contentOf])

  const banner = (() => {
    if (status === 'offline') return '没有网络，白板的改动会在恢复后保存'
    if (status === 'readonly') return '没有权限保存这块白板'
    if (status === 'unreadable') return '这块白板的文件读不出来，先不会覆盖它'
    return null
  })()

  return (
    <WhiteboardNodeContext.Provider value={actions}>
      <div
        ref={wrapperRef}
        data-whiteboard-canvas-scroll="true"
        className="relative -mx-2 h-[calc(100vh-12rem)] min-h-[480px] overflow-hidden border-y border-border/10 bg-background"
        onKeyDown={onKeyDown}
        onDoubleClick={onDoubleClick}
        onDragOver={(event) => {
          if (event.dataTransfer.types.includes(WHITEBOARD_LIBRARY_DRAG_TYPE)) event.preventDefault()
        }}
        onDrop={onDrop}
      >
        <ReactFlow
          nodes={flowNodes}
          edges={flowEdges}
          nodeTypes={NODE_TYPES}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onEdgeClick={(event, edge) => {
            if ((edge.data as { source?: string } | undefined)?.source !== 'view') return
            const bounds = wrapperRef.current?.getBoundingClientRect()
            setPicker({ edgeId: edge.id, left: event.clientX - (bounds?.left ?? 0), top: event.clientY - (bounds?.top ?? 0) })
          }}
          onPaneClick={() => { setPicker(null); setEditingId(null) }}
          connectionMode={ConnectionMode.Loose}
          panActivationKeyCode={null}
          zoomOnDoubleClick={false}
          deleteKeyCode={['Backspace', 'Delete']}
          fitView={canvas.nodes.length > 0}
          minZoom={0.1}
          maxZoom={2}
          proOptions={{ hideAttribution: true }}
        >
          <Background gap={20} size={1} />
          <MiniMap pannable zoomable style={{ bottom: 44 }} />
          <Controls position="bottom-right" orientation="horizontal" showInteractive={false} />
          <Panel position="bottom-right" style={{ marginRight: 128 }}><ZoomPercent /></Panel>
        </ReactFlow>

        <WhiteboardToolbar
          tool={tool}
          libraryOpen={libraryOpen}
          findItems={findItems}
          onTool={setTool}
          onAddCard={() => addTextNode()}
          onToggleLibrary={(tab) => {
            setLibraryTab(tab)
            setLibraryOpen((open) => (tab === libraryTab ? !open : true))
          }}
          onAddText={() => addTextNode(undefined, WHITEBOARD_TEXT_DEFAULT_SIZE)}
          onAddSection={addSection}
          onFocusItem={(id) => {
            setSelectedIds(new Set([id]))
            void flow.fitView({ nodes: [{ id }], duration: 200, maxZoom: 1.2 })
          }}
          onFit={() => { void flow.fitView({ duration: 200 }) }}
          onDeleteSelection={() => {
            const ids = new Set(selectedIds)
            updateCanvas((current) => removeCanvasNodes(current, ids))
            setSelectedIds(new Set())
          }}
        />

        {libraryOpen ? (
          <WhiteboardFilesSource enabled={libraryTab === 'files'}>
            {(libraryFiles) => (
              <WhiteboardLibraryPanel
                tab={libraryTab}
                cards={libraryCards}
                files={libraryFiles}
                onTab={setLibraryTab}
                onAdd={(item) => addCardByUri(item.uri)}
                onClose={() => setLibraryOpen(false)}
              />
            )}
          </WhiteboardFilesSource>
        ) : null}

        {canvas.nodes.length === 0 ? (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-1 px-4 text-center">
            <p className="text-sm font-semibold">新白板</p>
            <p className="text-xs text-muted-foreground">从右边卡片库把卡片拖进来，或者双击空白处新建一张；文件、PDF 里的几行也能拖</p>
          </div>
        ) : null}

        {banner ? (
          <div role="status" className="absolute inset-x-0 top-0 z-10 bg-muted px-3 py-2 text-xs">{banner}</div>
        ) : null}
        {status === 'conflict' && conflict ? (
          <div role="status" className="absolute inset-x-0 top-0 z-10 flex items-center gap-2 bg-muted px-3 py-2 text-xs">
            <span>
              {conflict.moved > 0
                ? `另一台设备刚移动了 ${conflict.moved} 张卡片`
                : '另一台设备刚改了这块白板'}
            </span>
            <button type="button" className="rounded-md bg-primary px-2 py-1 text-primary-foreground" onClick={takeLatest}>用最新的</button>
            <button type="button" className="rounded-md border border-border bg-card px-2 py-1" onClick={keepMine}>保留我的</button>
          </div>
        ) : null}
        {STATUS_TEXT[status] ? (
          <span className="pointer-events-none absolute right-3 top-2 z-10 text-[11px] text-muted-foreground">{STATUS_TEXT[status]}</span>
        ) : null}

        {picker && pickerEdge ? (
          <WhiteboardRelationPicker
            left={picker.left}
            top={picker.top}
            canWriteRelation={Boolean(pickerSubjects && relation?.openRelationEditorBetween)}
            otherPredicates={relation?.relationPredicateOptions ?? []}
            saveError={relation?.relationSaveError}
            onChoose={chooseRelation}
            onViewOnly={() => setPicker(null)}
            onRemove={() => {
              updateCanvas((current) => removeCanvasEdges(current, new Set([pickerEdge.id])))
              setPicker(null)
            }}
          />
        ) : null}
      </div>
    </WhiteboardNodeContext.Provider>
  )
}

export type { WhiteboardCanvas }
