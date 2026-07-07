import { Link2, Plus, Search } from 'lucide-react'
import type { CSSProperties, PointerEvent } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { getStructuredProjection } from './files-model'
import { readPrototypeStorage, writePrototypeStorage } from './prototypeStorage'
import type { PredicateDefinition, TableSortMode } from './files-types'

interface WhiteboardCardPosition {
  x: number
  y: number
}

const WHITEBOARD_LAYOUT_STORAGE_KEY = 'linx.prototype.files.whiteboardLayouts'
const CARD_WIDTH = 260
const CARD_HEIGHT = 116

function defaultCardPosition(index: number): WhiteboardCardPosition {
  return {
    x: 60 + (index % 2) * 360,
    y: 58 + Math.floor(index / 2) * 172,
  }
}

function clampPosition(position: WhiteboardCardPosition, frame: HTMLElement | null): WhiteboardCardPosition {
  if (!frame) return position
  return {
    x: Math.max(16, Math.min(Math.round(position.x), Math.max(16, frame.clientWidth - CARD_WIDTH - 16))),
    y: Math.max(16, Math.min(Math.round(position.y), Math.max(16, frame.clientHeight - CARD_HEIGHT - 16))),
  }
}

export function StructuredWhiteboardView({
  selectedClass,
  predicates,
  hiddenPredicateIds,
  cellOverrides,
  searchQuery,
  sortMode,
}: {
  selectedClass: string
  predicates: PredicateDefinition[]
  hiddenPredicateIds: string[]
  cellOverrides: Record<string, string>
  searchQuery: string
  sortMode: TableSortMode
}) {
  const projection = getStructuredProjection({
    selectedClass,
    predicates,
    hiddenPredicateIds,
    cellOverrides,
    searchQuery,
    sortMode,
  })
  const rows = projection.rows
  const colors = ['violet', 'blue', 'green', 'orange', 'yellow'] as const
  const layoutKey = useMemo(() => [
    selectedClass,
    projection.predicates.map((predicate) => predicate.id).join('|'),
  ].join('::'), [projection.predicates, selectedClass])
  const frameRef = useRef<HTMLDivElement | null>(null)
  const [layouts, setLayouts] = useState<Record<string, Record<string, WhiteboardCardPosition>>>(() => (
    readPrototypeStorage<Record<string, Record<string, WhiteboardCardPosition>>>(WHITEBOARD_LAYOUT_STORAGE_KEY, {})
  ))
  const [draggingSubject, setDraggingSubject] = useState<string | null>(null)
  const currentLayout = layouts[layoutKey] ?? {}

  useEffect(() => {
    writePrototypeStorage(WHITEBOARD_LAYOUT_STORAGE_KEY, layouts)
  }, [layouts])

  const positionFor = (subject: string, index: number) => currentLayout[subject] ?? defaultCardPosition(index)

  const setCardPosition = (subject: string, position: WhiteboardCardPosition) => {
    setLayouts((current) => ({
      ...current,
      [layoutKey]: {
        ...(current[layoutKey] ?? {}),
        [subject]: clampPosition(position, frameRef.current),
      },
    }))
  }

  const startDrag = (event: PointerEvent<HTMLElement>, subject: string, index: number) => {
    event.currentTarget.setPointerCapture(event.pointerId)
    const start = positionFor(subject, index)
    const startPointer = { x: event.clientX, y: event.clientY }
    setDraggingSubject(subject)

    const onMove = (moveEvent: globalThis.PointerEvent) => {
      setCardPosition(subject, {
        x: start.x + moveEvent.clientX - startPointer.x,
        y: start.y + moveEvent.clientY - startPointer.y,
      })
    }

    const onUp = () => {
      setDraggingSubject(null)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
  }

  return (
    <section
      className="whiteboard-surface"
      data-class-scope={selectedClass}
      data-layout-key={layoutKey}
      data-predicate-count={projection.predicates.length}
      data-subject-count={rows.length}
    >
      <div className="whiteboard-toolbar">
        <button><Plus size={14} /> Card</button>
        <button><Link2 size={14} /> Relation</button>
        <button><Search size={14} /></button>
      </div>
      <div className="whiteboard-subject-index" aria-hidden="true">
        {rows.map((row, index) => (
          <span data-whiteboard-index={index} data-whiteboard-subject={row.subject} key={row.subject} />
        ))}
      </div>
      <div className="whiteboard-predicate-index" aria-hidden="true">
        {projection.predicates.map((predicate, index) => (
          <span data-whiteboard-predicate={predicate.id} data-whiteboard-predicate-index={index} key={predicate.id} />
        ))}
      </div>
      <div className="whiteboard-board-frame" ref={frameRef}>
        <svg className="whiteboard-lines" viewBox="0 0 760 420" aria-hidden="true">
          <path data-whiteboard-shape="rdf-relation" d="M 288 120 C 358 88, 414 88, 484 120" />
          <path data-whiteboard-shape="visual-relation" d="M 288 188 C 354 248, 418 248, 484 188" />
        </svg>
        <div className="whiteboard-card-layer">
          {rows.map((row, index) => (
            <article
              className="whiteboard-card"
              data-dragging={draggingSubject === row.subject}
              data-layout-x={positionFor(row.subject, index).x}
              data-layout-y={positionFor(row.subject, index).y}
              data-whiteboard-shape="subject-card"
              data-whiteboard-subject={row.subject}
              data-tone={colors[index % colors.length]}
              key={row.subject}
              onPointerDown={(event) => startDrag(event, row.subject, index)}
              style={{
                '--whiteboard-x': `${positionFor(row.subject, index).x}px`,
                '--whiteboard-y': `${positionFor(row.subject, index).y}px`,
              } as CSSProperties}
            >
              <span>{row.subject}</span>
              <strong>{row.label || row.meta}</strong>
              <small>{projection.predicates.length} predicates visible</small>
            </article>
          ))}
          <span className="whiteboard-relation-label rdf" data-whiteboard-shape="relation-label">RDF relation</span>
          <span className="whiteboard-relation-label visual" data-whiteboard-shape="relation-label">visual layout</span>
        </div>
      </div>
    </section>
  )
}
