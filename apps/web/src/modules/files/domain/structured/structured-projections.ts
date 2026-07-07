import type { StructuredTableProjection, StructuredTableRow } from './structured-table'

export interface StructuredCardProjection {
  subject: string
  title: string
  className: string | null
  summary: string
  tags: string[]
}

export interface StructuredKanbanColumn {
  id: string
  label: string
  value: string | null
  cards: StructuredCardProjection[]
}

export interface StructuredKanbanProjection {
  groupPredicate: string | null
  columns: StructuredKanbanColumn[]
}

export interface StructuredWhiteboardNode extends StructuredCardProjection {
  x: number
  y: number
}

export interface StructuredWhiteboardRelation {
  id: string
  from: string
  to: string
  predicate: string
  source: 'rdf' | 'visual'
}

export interface StructuredWhiteboardProjection {
  nodes: StructuredWhiteboardNode[]
  relations: StructuredWhiteboardRelation[]
}

export interface StructuredWhiteboardVisualRelation {
  id: string
  from: string
  to: string
  label: string
}

function valuesFor(row: StructuredTableRow, predicate: string): string[] {
  return row.cells.find((cell) => cell.predicate === predicate)?.values ?? []
}

function firstValue(row: StructuredTableRow, predicates: string[]): string | null {
  for (const predicate of predicates) {
    const value = valuesFor(row, predicate)[0]
    if (value) return value
  }
  return null
}

function cleanLiteral(value: string): string {
  return value
    .replace(/^"/, '')
    .replace(/"(?:@[A-Za-z-]+|\^\^.+)?$/, '')
}

function localName(value: string): string {
  if (value.trim().startsWith('"')) return cleanLiteral(value)
  const cleaned = cleanLiteral(value)
  const hashIndex = cleaned.lastIndexOf('#')
  if (hashIndex >= 0) return cleaned.slice(hashIndex + 1)
  const slashIndex = cleaned.lastIndexOf('/')
  if (slashIndex >= 0) return cleaned.slice(slashIndex + 1)
  const colonIndex = cleaned.lastIndexOf(':')
  if (colonIndex >= 0) return cleaned.slice(colonIndex + 1)
  return cleaned
}

type ProjectionWithScope = StructuredTableProjection & { className?: string | null }

const TITLE_PREDICATES = [
  'schema:name',
  'https://schema.org/name',
  'rdfs:label',
  'http://www.w3.org/2000/01/rdf-schema#label',
  'dcterms:title',
  'http://purl.org/dc/terms/title',
  'title',
]

const CLASS_PREDICATES = [
  'rdf:type',
  'http://www.w3.org/1999/02/22-rdf-syntax-ns#type',
]

const TAG_PREDICATES = [
  'tags',
  'schema:keywords',
  'https://schema.org/keywords',
  'dcterms:subject',
  'http://purl.org/dc/terms/subject',
]

const SUMMARY_PREDICATES = [
  'schema:description',
  'https://schema.org/description',
  'dcterms:description',
  'http://purl.org/dc/terms/description',
  'summary',
  'about',
]

export function projectStructuredCards(projection: ProjectionWithScope): StructuredCardProjection[] {
  return projection.rows.map((row) => {
    const title = firstValue(row, TITLE_PREDICATES) ?? row.subject
    const className = firstValue(row, CLASS_PREDICATES) ?? projection.className ?? null
    const tags = TAG_PREDICATES.flatMap((predicate) => valuesFor(row, predicate)).map(localName)

    const summary = firstValue(row, SUMMARY_PREDICATES) ?? className ?? row.subject

    return {
      subject: row.subject,
      title: cleanLiteral(title),
      className: className ? localName(className) : null,
      summary: cleanLiteral(summary),
      tags,
    }
  })
}

export function projectStructuredKanban(
  projection: ProjectionWithScope,
  groupPredicate?: string | null,
  kanbanOrder: Record<string, string[]> = {},
): StructuredKanbanProjection {
  const cards = projectStructuredCards(projection)
  const predicate = groupPredicate && projection.predicates.includes(groupPredicate) ? groupPredicate : null
  const columnsById = new Map<string, StructuredKanbanColumn>()

  for (const row of projection.rows) {
    const card = cards.find((candidate) => candidate.subject === row.subject)
    if (!card) continue
    const groupValue = predicate ? valuesFor(row, predicate)[0] : null
    const columnId = groupValue ? localName(groupValue) : 'unassigned'
    const column = columnsById.get(columnId) ?? {
      id: columnId,
      label: groupValue ? cleanLiteral(localName(groupValue)) : 'Unassigned',
      value: groupValue ?? null,
      cards: [],
    }
    column.cards.push(card)
    columnsById.set(columnId, column)
  }

  for (const column of columnsById.values()) {
    const order = kanbanOrder[column.id]
    if (!order || order.length === 0) continue
    const orderIndex = new Map(order.map((subject, index) => [subject, index]))
    column.cards = [...column.cards].sort((left, right) => {
      const leftIndex = orderIndex.get(left.subject)
      const rightIndex = orderIndex.get(right.subject)
      if (leftIndex != null && rightIndex != null) return leftIndex - rightIndex
      if (leftIndex != null) return -1
      if (rightIndex != null) return 1
      return 0
    })
  }

  return {
    groupPredicate: predicate,
    columns: Array.from(columnsById.values()).sort((left, right) => {
      if (left.id === 'unassigned') return 1
      if (right.id === 'unassigned') return -1
      return 0
    }),
  }
}

export function projectStructuredWhiteboard(
  projection: ProjectionWithScope,
  selectedSubjects?: readonly string[],
  visualRelations: readonly StructuredWhiteboardVisualRelation[] = [],
): StructuredWhiteboardProjection {
  const selectedSubjectSet = selectedSubjects ? new Set(selectedSubjects) : null
  const cards = projectStructuredCards(projection).filter((card) => (
    !selectedSubjectSet || selectedSubjectSet.has(card.subject)
  ))
  const nodes = cards.map((card, index) => ({
    ...card,
    x: 40 + (index % 3) * 220,
    y: 40 + Math.floor(index / 3) * 150,
  }))
  const subjectSet = new Set(cards.map((card) => card.subject))
  const relations: StructuredWhiteboardRelation[] = []

  for (const row of projection.rows) {
    if (!subjectSet.has(row.subject)) continue
    for (const cell of row.cells) {
      if (cell.predicate === 'rdf:type') continue
      for (const value of cell.values) {
        if (!subjectSet.has(value)) continue
        relations.push({
          id: `${row.subject}-${cell.predicate}-${value}`,
          from: row.subject,
          to: value,
          predicate: cell.predicate,
          source: 'rdf',
        })
      }
    }
  }

  for (const relation of visualRelations) {
    if (!relation.id || !relation.from || !relation.to) continue
    if (!subjectSet.has(relation.from) || !subjectSet.has(relation.to)) continue
    relations.push({
      id: relation.id,
      from: relation.from,
      to: relation.to,
      predicate: relation.label,
      source: 'visual',
    })
  }

  return { nodes, relations }
}
