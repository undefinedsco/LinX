import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import type { StructuredSubjectPeek } from '../../domain/structured/structured-subject-peek'
import { useStructuredSubjectPeekBodyController } from './useStructuredSubjectPeekBodyController'

const peek: NonNullable<StructuredSubjectPeek> = {
  subject: '#Task',
  targetUri: 'https://pod.example/.data/tasks.ttl#Task',
  kind: 'resource',
  rowIndex: 0,
  scrollTop: 0,
  title: 'Task',
  className: '<https://undefineds.co/vocab/Task>',
  summary: 'A task card.',
  source: 'https://example.com/report.pdf',
  sourceLinkedCard: {
    bodyResourceUri: 'https://pod.example/.data/cards/report.md',
    ingestManifestUri: 'https://pod.example/.parser/report/manifest.ttl',
    ingestVersion: 'pdf-v1',
    sourceHash: 'sha256-report',
  },
  facts: [
    { predicate: 'rdfs:label', values: ['"Task"'] },
  ],
  predicates: [
    {
      predicate: 'https://undefineds.co/vocab/reviewStatus',
      values: ['"Ready"', '<https://pod.example/.data/cards/report.md>'],
    },
  ],
  backlinks: [
    {
      subject: '#Workspace',
      predicate: 'https://undefineds.co/vocab/contains',
      values: ['#Task'],
    },
  ],
}

describe('useStructuredSubjectPeekBodyController', () => {
  it('projects subject peek display labels, rows, and formatted fact values outside the drawer renderer', () => {
    const { result } = renderHook(() => useStructuredSubjectPeekBodyController(peek))

    expect(result.current.typeLabel).toBe('Task')
    expect(result.current.locationLabel).toBe('资源')
    expect(result.current.showSourceLinkedCardSection).toBe(true)
    expect(result.current.sourceRows).toEqual([
      ['来源', 'https://example.com/report.pdf'],
      ['正文', 'https://pod.example/.data/cards/report.md'],
      ['同步', 'pdf-v1'],
      ['同步记录', 'https://pod.example/.parser/report/manifest.ttl'],
    ])
    expect(result.current.showPredicateSection).toBe(true)
    expect(result.current.predicateRows).toEqual([
      {
        key: 'https://undefineds.co/vocab/reviewStatus',
        label: 'reviewStatus',
        predicate: 'https://undefineds.co/vocab/reviewStatus',
        title: '"Ready", <https://pod.example/.data/cards/report.md>',
        values: 'Ready, https://pod.example/.data/cards/report.md',
      },
    ])
    expect(result.current.showBacklinkSection).toBe(true)
    expect(result.current.backlinkRows).toEqual([
      {
        key: '#Workspace-https://undefineds.co/vocab/contains',
        label: 'contains',
        predicate: 'https://undefineds.co/vocab/contains',
        subject: '#Workspace',
      },
    ])
    expect(result.current.showTermDefinitionSection).toBe(false)
    expect(result.current.termFactRows).toEqual([
      {
        key: 'rdfs:label',
        predicate: 'rdfs:label',
        title: '"Task"',
        values: '"Task"',
      },
    ])
  })

  it('owns technical detail expansion state and term/external location labels', () => {
    const { result, rerender } = renderHook(
      ({ kind }: { kind: 'term' | 'external' }) => useStructuredSubjectPeekBodyController({
        ...peek,
        kind,
        sourceLinkedCard: null,
      }),
      { initialProps: { kind: 'term' } },
    )

    expect(result.current.locationLabel).toBe('词表文件')
    expect(result.current.technicalDetailsOpen).toBe(false)
    expect(result.current.technicalDetailsToggle).toEqual({
      expanded: false,
      stateLabel: 'URI',
    })

    act(() => result.current.toggleTechnicalDetails())

    expect(result.current.technicalDetailsOpen).toBe(true)
    expect(result.current.technicalDetailsToggle).toEqual({
      expanded: true,
      stateLabel: '收起',
    })

    rerender({ kind: 'external' })

    expect(result.current.locationLabel).toBe('外部链接')
    expect(result.current.sourceRows).toEqual([])
    expect(result.current.showSourceLinkedCardSection).toBe(false)
  })

  it('projects subject peek section visibility instead of leaving raw peek checks in the renderer', () => {
    const term = renderHook(() => useStructuredSubjectPeekBodyController({
      ...peek,
      kind: 'term',
      sourceLinkedCard: null,
      source: 'https://pod.example/.vocab/terms.ttl',
      predicates: [],
      backlinks: [],
    }))

    expect(term.result.current.showPredicateSection).toBe(false)
    expect(term.result.current.showBacklinkSection).toBe(false)
    expect(term.result.current.showTermDefinitionSection).toBe(true)
    expect(term.result.current.showSourceSection).toBe(true)

    const emptySourceLinked = renderHook(() => useStructuredSubjectPeekBodyController({
      ...peek,
      source: '',
      sourceLinkedCard: {
        bodyResourceUri: '',
        ingestManifestUri: '',
        ingestVersion: '',
        sourceHash: '',
      },
      facts: [],
      predicates: [],
      backlinks: [],
    }))

    expect(emptySourceLinked.result.current.showSourceLinkedCardSection).toBe(false)
    expect(emptySourceLinked.result.current.showTermDefinitionSection).toBe(false)
    expect(emptySourceLinked.result.current.showSourceSection).toBe(false)
  })
})
