import { describe, expect, it } from 'vitest'

import type { StructuredSubjectPeek } from '../../domain/structured/structured-subject-peek'
import { projectStructuredSubjectPeekBodyModel } from './structured-subject-peek-body-model'

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

describe('structured subject peek body model', () => {
  it('projects labels, fact rows, source-linked rows, and section visibility', () => {
    expect(projectStructuredSubjectPeekBodyModel(peek)).toEqual({
      backlinkRows: [
        {
          key: '#Workspace-https://undefineds.co/vocab/contains',
          label: 'contains',
          predicate: 'https://undefineds.co/vocab/contains',
          subject: '#Workspace',
        },
      ],
      chrome: {
        backlinkSection: {
          heading: '反向链接',
        },
        predicateSection: {
          heading: '属性',
        },
        sourceLinkedSection: {
          ariaLabel: '来源与同步信息',
          heading: '来源与同步',
        },
        sourceSection: {
          heading: '来源',
        },
        summary: {
          ariaLabel: 'Subject card summary',
          typePrefix: '类型',
        },
        technicalDetails: {
          ariaLabel: '查看 URI 详情',
          label: '更多信息',
          subjectUriLabel: 'Subject URI',
        },
        termDefinitionSection: {
          heading: 'term 定义',
        },
      },
      locationLabel: '资源',
      predicateRows: [
        {
          key: 'https://undefineds.co/vocab/reviewStatus',
          label: 'reviewStatus',
          predicate: 'https://undefineds.co/vocab/reviewStatus',
          title: '"Ready", <https://pod.example/.data/cards/report.md>',
          values: 'Ready, https://pod.example/.data/cards/report.md',
        },
      ],
      showBacklinkSection: true,
      showPredicateSection: true,
      showSourceLinkedCardSection: true,
      showSourceSection: false,
      showTermDefinitionSection: false,
      sourceRows: [
        ['来源', 'https://example.com/report.pdf'],
        ['正文', 'https://pod.example/.data/cards/report.md'],
        ['同步', 'pdf-v1'],
        ['同步记录', 'https://pod.example/.parser/report/manifest.ttl'],
      ],
      sourceValue: 'https://example.com/report.pdf',
      termFactRows: [
        {
          key: 'rdfs:label',
          predicate: 'rdfs:label',
          title: '"Task"',
          values: '"Task"',
        },
      ],
      typeLabel: 'Task',
    })
  })

  it('projects term, external, and empty source-linked variants without raw renderer checks', () => {
    expect(projectStructuredSubjectPeekBodyModel({
      ...peek,
      kind: 'term',
      sourceLinkedCard: null,
    }).locationLabel).toBe('词表文件')

    expect(projectStructuredSubjectPeekBodyModel({
      ...peek,
      kind: 'external',
      sourceLinkedCard: null,
    }).locationLabel).toBe('外部链接')

    const term = projectStructuredSubjectPeekBodyModel({
      ...peek,
      kind: 'term',
      sourceLinkedCard: null,
      source: 'https://pod.example/.vocab/terms.ttl',
      predicates: [],
      backlinks: [],
    })

    expect(term.showPredicateSection).toBe(false)
    expect(term.showBacklinkSection).toBe(false)
    expect(term.showTermDefinitionSection).toBe(true)
    expect(term.showSourceSection).toBe(true)

    const emptySourceLinked = projectStructuredSubjectPeekBodyModel({
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
    })

    expect(emptySourceLinked.sourceRows).toEqual([])
    expect(emptySourceLinked.showSourceLinkedCardSection).toBe(false)
    expect(emptySourceLinked.showTermDefinitionSection).toBe(false)
    expect(emptySourceLinked.showSourceSection).toBe(false)
  })
})
