import { DndContext, closestCenter, useDroppable, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { ExternalLink, ListFilter, MoreHorizontal, Plus } from 'lucide-react'
import {
  getStructuredProjection,
  predicateLocalName,
  structuredClassStates,
  sourceLinkedCardForSubject,
  vocabStateLabel,
} from './files-model'
import type { PredicateDefinition, TableSortMode } from './files-types'

interface KanbanCard {
  id: string
  subject: string
  cardKind: string
  className: string
  classState: string
  summary: string
  sourceUrl?: string
  sourcePath?: string
  predicateChips: Array<{ id: string; label: string; value: string }>
  relation: string
  relationCount: number
  status: string
}

interface KanbanColumn {
  id: string
  title: string
  cards: KanbanCard[]
}

export interface StructuredKanbanViewProps {
  selectedClass: string
  predicates: PredicateDefinition[]
  hiddenPredicateIds: string[]
  cellOverrides: Record<string, string>
  searchQuery: string
  sortMode: TableSortMode
  onSetCellValue: (subject: string, predicateId: string, nextValue: string) => void
}

function SortableKanbanCard({ card }: { card: KanbanCard }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: card.id })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <article
      className={`kanban-card ${isDragging ? 'dragging' : ''}`}
      data-subject={card.subject}
      data-card-kind={card.cardKind}
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
    >
      <div className="kanban-card-head">
        <strong className="kanban-card-title">{card.subject}</strong>
        <button title="Card actions" aria-label={`${card.subject} actions`}><MoreHorizontal size={14} /></button>
      </div>
      <p className="kanban-card-summary">{card.summary}</p>
      <div className="kanban-card-byline" data-source-url={card.sourceUrl ?? ''} data-source-path={card.sourcePath ?? ''}>
        <em data-kanban-class-marker={card.className}>
          {card.className}{card.classState !== 'confirmed' ? '*' : ''}
        </em>
        <small>{card.status}</small>
        {card.cardKind === 'source-linked-card' ? <small>Source-linked card</small> : null}
      </div>
      <div className="kanban-predicate-chips" aria-label={`${card.subject} predicate summary`}>
        {card.predicateChips.map((chip) => (
          <span className="kanban-predicate-chip" data-predicate-id={chip.id} key={chip.id}>
            <b>{chip.label}</b>
            <i>{chip.value}</i>
          </span>
        ))}
      </div>
      <button className="kanban-relation-action" data-relation-count={card.relationCount} type="button">
        <ExternalLink size={13} />
        <span>{card.relationCount} relation{card.relationCount === 1 ? '' : 's'}</span>
      </button>
    </article>
  )
}

function KanbanColumnLane({ column }: { column: KanbanColumn }) {
  const { setNodeRef, isOver } = useDroppable({ id: column.id })

  return (
    <section
      className={`kanban-column ${isOver ? 'drop-target' : ''}`}
      data-kanban-status={column.title}
      data-kanban-column={column.id}
      id={column.id}
      ref={setNodeRef}
    >
      <header>
        <strong>{column.title}</strong>
        <em>{column.cards.length}</em>
      </header>
      {column.cards.map((card) => (
        <div className="kanban-subject-section" data-kanban-subject={card.subject} key={card.id}>
          <div className="kanban-subject-header">
            <span>{card.subject}</span>
          </div>
          <SortableKanbanCard card={card} />
        </div>
      ))}
    </section>
  )
}

export function StructuredKanbanView({
  selectedClass,
  predicates,
  hiddenPredicateIds,
  cellOverrides,
  searchQuery,
  sortMode,
  onSetCellValue,
}: StructuredKanbanViewProps) {
  const reviewPredicateId = 'udfs:reviewStatus'
  const statusColumns = ['Draft', 'Ready', 'Published']
  const projection = getStructuredProjection({
    selectedClass,
    predicates,
    hiddenPredicateIds,
    cellOverrides,
    searchQuery,
    sortMode,
  })
  const summaryPredicates = projection.predicates.filter((predicate) => !['dcterms:title', reviewPredicateId].includes(predicate.id))
  const relationCount = (value: string) => value.split(/,|\band\b|\bby\b/).map((part) => part.trim()).filter(Boolean).length || 1
  const cardKind = (subject: string) => {
    if (sourceLinkedCardForSubject(subject)) return 'source-linked-card'
    if (/^https?:\/\//.test(subject)) return 'external-url'
    return 'subject-card'
  }
  const columns: KanbanColumn[] = statusColumns.map((status) => ({
    id: status,
    title: status,
    cards: projection.rows
      .filter((row) => (projection.cellValue(row.subject, reviewPredicateId) ?? 'Draft') === status)
      .map((row) => {
        const sourceLinkedCard = sourceLinkedCardForSubject(row.subject)
        return {
          id: row.subject,
          subject: row.subject,
          cardKind: cardKind(row.subject),
          className: row.className,
          classState: structuredClassStates[row.className] ?? 'confirmed',
          summary: row.label || row.meta,
          sourceUrl: sourceLinkedCard?.sourceReview?.source,
          sourcePath: sourceLinkedCard?.path,
          predicateChips: summaryPredicates
            .map((predicate) => ({
              id: predicate.id,
              label: predicateLocalName(predicate.label),
              value: projection.cellValue(row.subject, predicate.id) ?? '',
            }))
            .filter((chip) => chip.value)
            .slice(0, 3),
          relation: row.relation,
          relationCount: relationCount(row.relation),
          status,
        }
      }),
  }))

  const moveCard = (event: DragEndEvent) => {
    const activeId = String(event.active.id)
    const overId = event.over ? String(event.over.id) : null
    if (!overId || activeId === overId) return

    const targetColumn = columns.find((column) => column.id === overId || column.cards.some((card) => card.id === overId))
    if (!targetColumn) return
    const currentStatus = projection.cellValue(activeId, reviewPredicateId) ?? 'Draft'
    if (currentStatus === targetColumn.id) return
    onSetCellValue(activeId, reviewPredicateId, targetColumn.id)
  }

  return (
    <section className="kanban-surface" data-class-scope={selectedClass} data-predicate-count={projection.predicates.length}>
      <div className="kanban-toolbar">
        <span>
          <ListFilter size={14} />
          {selectedClass}{structuredClassStates[selectedClass] ? '*' : ''} · reviewStatus · {vocabStateLabel(structuredClassStates[selectedClass])}
        </span>
        <button><Plus size={14} /> Card</button>
        <button><MoreHorizontal size={14} /></button>
      </div>
      <div className="structured-predicate-index" aria-hidden="true">
        {projection.predicates.map((predicate, index) => (
          <span data-projection-predicate={predicate.id} data-projection-predicate-index={index} key={predicate.id} />
        ))}
      </div>
      <DndContext collisionDetection={closestCenter} onDragEnd={moveCard}>
        <div className="kanban-board" aria-label="Structured resource kanban">
          {columns.map((column) => (
            <SortableContext items={[column.id, ...column.cards.map((card) => card.id)]} key={column.id} strategy={verticalListSortingStrategy}>
              <KanbanColumnLane column={column} />
            </SortableContext>
          ))}
        </div>
      </DndContext>
    </section>
  )
}
