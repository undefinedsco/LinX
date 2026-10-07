import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { projectStructuredKanban, projectStructuredWhiteboard } from './domain/structured/structured-projections'
import { projectStructuredClassScope, projectTurtleTable } from './domain/structured/structured-table'

const structuredProjectionsPath = 'src/modules/files/domain/structured/structured-projections.ts'
const rootStructuredProjectionsShimPath = 'src/modules/files/structured-projections.ts'

describe('structured projections', () => {
  it('keeps structured derived projections in domain/structured with a root compatibility shim', () => {
    expect(existsSync(structuredProjectionsPath)).toBe(true)
    expect(existsSync(rootStructuredProjectionsShimPath)).toBe(true)
    if (!existsSync(structuredProjectionsPath) || !existsSync(rootStructuredProjectionsShimPath)) return

    const projectionSource = readFileSync(structuredProjectionsPath, 'utf8')
    const rootShimSource = readFileSync(rootStructuredProjectionsShimPath, 'utf8')

    expect(rootShimSource).toMatch(/^export \* from '.\/domain\/structured\/structured-projections'\n?$/)
    expect(projectionSource).not.toContain("from './store'")
    expect(projectionSource).not.toContain("from '../store'")
    expect(projectionSource).toContain('export interface StructuredWhiteboardVisualRelation')
  })

  it('does not infer Kanban grouping from predicate names', () => {
    const projection = projectTurtleTable(`
@prefix udfs: <https://undefineds.co/vocab/> .
<#one> a udfs:Task ; title "Draft" ; status "todo" ; tags "core" .
<#two> a udfs:Task ; title "Ship" ; status "done" .
<#three> a udfs:Task ; title "Unsorted" .
`)

    const kanban = projectStructuredKanban(projection)

    expect(kanban.groupPredicate).toBeNull()
    expect(kanban.columns.map((column) => column.label)).toEqual(['Unassigned'])
    expect(kanban.columns[0].cards.map((card) => card.subject).sort()).toEqual(['#one', '#three', '#two'].sort())
  })

  it('projects subject rows into Kanban columns when a grouping predicate is requested', () => {
    const projection = projectTurtleTable(`
@prefix udfs: <https://undefineds.co/vocab/> .
<#one> a udfs:Task ; title "Draft" ; status "todo" ; tags "core" .
<#two> a udfs:Task ; title "Ship" ; status "done" .
<#three> a udfs:Task ; title "Unsorted" .
`)

    const kanban = projectStructuredKanban(projection, 'status')

    expect(kanban.groupPredicate).toBe('status')
    expect(kanban.columns.map((column) => column.label)).toEqual(['todo', 'done', 'Unassigned'])
    expect(kanban.columns[0].cards[0]).toMatchObject({
      subject: '#one',
      title: 'Draft',
      className: 'Task',
      tags: ['core'],
    })
  })

  it('uses full predicate IRI aliases for Kanban card title and class metadata', () => {
    const projection = projectTurtleTable(`
@prefix udfs: <https://undefineds.co/vocab/> .
<#Mover> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> udfs:Task ;
  <http://www.w3.org/2000/01/rdf-schema#label> "Mover card" ;
  <https://undefineds.co/vocab/mode> "queue" .
`)

    const kanban = projectStructuredKanban(projection, 'https://undefineds.co/vocab/mode')

    expect(kanban.columns[0].cards[0]).toMatchObject({
      subject: '#Mover',
      title: 'Mover card',
      className: 'Task',
    })
  })

  it('uses a namespaced title term before falling back to the subject URI', () => {
    const projection = projectTurtleTable(`
<#Workspace> <https://undefineds.co/vocab/title> "Readable workspace" .
`)

    const kanban = projectStructuredKanban(projection)
    const whiteboard = projectStructuredWhiteboard(projection)

    expect(kanban.columns[0].cards[0].title).toBe('Readable workspace')
    expect(whiteboard.nodes[0].title).toBe('Readable workspace')
  })

  it('does not treat an unrelated predicate with a title-like local name as card identity', () => {
    const projection = projectTurtleTable(`
<#Audit> <https://example.invalid/audit/name> "Internal audit key" .
`)

    const kanban = projectStructuredKanban(projection)
    const whiteboard = projectStructuredWhiteboard(projection)

    expect(kanban.columns[0].cards[0].title).toBe('#Audit')
    expect(whiteboard.nodes[0].title).toBe('#Audit')
  })

  it('projects subject-to-subject objects into whiteboard relation lines', () => {
    const projection = projectTurtleTable(`
@prefix udfs: <https://undefineds.co/vocab/> .
<#one> a udfs:Note ; title "One" ; related <#two> .
<#two> a udfs:Note ; title "Two" .
<#three> a udfs:Note ; title "Three" ; related <https://example.com/external> .
`)

    const whiteboard = projectStructuredWhiteboard(projection)

    expect(whiteboard.nodes.map((node) => node.title)).toEqual(['One', 'Three', 'Two'])
    expect(whiteboard.relations).toEqual([
      {
        id: '#one-related-#two',
        from: '#one',
        to: '#two',
        predicate: 'related',
        source: 'rdf',
      },
    ])
  })

  it('projects only selected subjects into whiteboard cards and relation lines', () => {
    const projection = projectTurtleTable(`
@prefix udfs: <https://undefineds.co/vocab/> .
<#one> a udfs:Note ; title "One" ; related <#two> .
<#two> a udfs:Note ; title "Two" .
<#three> a udfs:Note ; title "Three" ; related <#one> .
`)

    const oneOnly = projectStructuredWhiteboard(projection, ['#one'])

    expect(oneOnly.nodes.map((node) => node.subject)).toEqual(['#one'])
    expect(oneOnly.relations).toEqual([])

    const linkedPair = projectStructuredWhiteboard(projection, ['#one', '#two'])

    expect(linkedPair.nodes.map((node) => node.subject)).toEqual(['#one', '#two'])
    expect(linkedPair.relations).toEqual([
      {
        id: '#one-related-#two',
        from: '#one',
        to: '#two',
        predicate: 'related',
        source: 'rdf',
      },
    ])
  })

  it('merges persisted visual whiteboard relations without treating them as RDF facts', () => {
    const projection = projectTurtleTable(`
@prefix udfs: <https://undefineds.co/vocab/> .
<#one> a udfs:Note ; title "One" ; related <#two> .
<#two> a udfs:Note ; title "Two" .
<#three> a udfs:Note ; title "Three" .
`)

    const whiteboard = projectStructuredWhiteboard(projection, ['#one', '#two', '#three'], [
      { id: 'visual-one-three', from: '#one', to: '#three', label: 'sketch link' },
      { id: 'visual-external', from: '#one', to: '#missing', label: 'hidden link' },
    ])

    expect(whiteboard.relations).toEqual([
      {
        id: '#one-related-#two',
        from: '#one',
        to: '#two',
        predicate: 'related',
        source: 'rdf',
      },
      {
        id: 'visual-one-three',
        from: '#one',
        to: '#three',
        predicate: 'sketch link',
        source: 'visual',
      },
    ])
  })

  it('keeps scoped class metadata on derived cards when rdf:type is hidden from table cells', () => {
    const projection = projectTurtleTable(`
@prefix udfs: <https://undefineds.co/vocab/> .
<#one> a udfs:Task ; title "Draft" ; status "todo" .
<#page> a udfs:Page ; title "Page" .
`)
    const scoped = projectStructuredClassScope(projection, 'udfs:Task')

    const kanban = projectStructuredKanban(scoped)

    expect(scoped.rows[0].cells.some((cell) => cell.predicate === 'rdf:type')).toBe(false)
    expect(kanban.columns[0].cards[0]).toMatchObject({
      subject: '#one',
      className: 'Task',
    })
  })

  it('uses the requested grouping predicate when it exists', () => {
    const projection = projectTurtleTable(`
@prefix udfs: <https://undefineds.co/vocab/> .
<#one> a udfs:Task ; title "Draft" ; status "todo" ; mode "drafting" .
<#two> a udfs:Task ; title "Ship" ; status "done" ; mode "release" .
`)

    const kanban = projectStructuredKanban(projection, 'mode')

    expect(kanban.groupPredicate).toBe('mode')
    expect(kanban.columns.map((column) => column.label)).toEqual(['drafting', 'release'])
  })

  it('preserves canonical Kanban column values for IRI-backed grouping predicates', () => {
    const projection = projectTurtleTable(`
@prefix udfs: <https://undefineds.co/vocab/> .
<#one> a udfs:Task ; title "Draft" ; status <https://example.com/status/todo> .
<#two> a udfs:Task ; title "Ship" ; status <https://example.com/status/done> .
`)

    const kanban = projectStructuredKanban(projection, 'status')

    expect(kanban.columns.map((column) => ({
      id: column.id,
      label: column.label,
      value: column.value,
    }))).toEqual([
      { id: 'todo', label: 'todo', value: 'https://example.com/status/todo' },
      { id: 'done', label: 'done', value: 'https://example.com/status/done' },
    ])
  })

  it('orders Kanban cards from view metadata without changing group membership', () => {
    const projection = projectTurtleTable(`
@prefix udfs: <https://undefineds.co/vocab/> .
<#one> a udfs:Task ; title "One" ; status "todo" .
<#two> a udfs:Task ; title "Two" ; status "todo" .
<#three> a udfs:Task ; title "Three" ; status "todo" .
<#done> a udfs:Task ; title "Done" ; status "done" .
`)

    const kanban = projectStructuredKanban(projection, 'status', {
      todo: ['#three', '#one'],
    })

    expect(kanban.columns.find((column) => column.id === 'todo')?.cards.map((card) => card.subject)).toEqual([
      '#three',
      '#one',
      '#two',
    ])
    expect(kanban.columns.find((column) => column.id === 'done')?.cards.map((card) => card.subject)).toEqual(['#done'])
  })
})
