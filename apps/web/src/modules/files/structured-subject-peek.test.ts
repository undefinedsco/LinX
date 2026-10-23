import { describe, expect, it } from 'vitest'
import { deriveStructuredSubjectPeekFacts, resolveStructuredRelationOpenTarget } from './domain/structured/structured-subject-peek'

const documentUri = 'https://pod.example/.data/workspaces/ws-1/state.ttl'

describe('structured subject and relation open targets', () => {
  it('resolves external relation values as external targets', () => {
    expect(resolveStructuredRelationOpenTarget(documentUri, 'https://source.example/report.pdf')).toEqual({
      targetUri: 'https://source.example/report.pdf',
      kind: 'external',
      canNavigateDirectly: false,
    })
  })

  it('resolves same-Pod resource relation values as resource targets', () => {
    expect(resolveStructuredRelationOpenTarget(documentUri, '<https://pod.example/public/report.md>')).toEqual({
      targetUri: 'https://pod.example/public/report.md',
      kind: 'resource',
      canNavigateDirectly: true,
    })
  })

  it('resolves fragment relation values to their containing resource or term registry', () => {
    expect(resolveStructuredRelationOpenTarget(documentUri, '#Task')).toEqual({
      targetUri: documentUri,
      kind: 'resource',
      canNavigateDirectly: false,
    })
    expect(resolveStructuredRelationOpenTarget(documentUri, 'https://pod.example/.vocab/terms.ttl#Task')).toEqual({
      targetUri: 'https://pod.example/.vocab/terms.ttl',
      kind: 'term',
      canNavigateDirectly: false,
    })
  })
})

describe('structured subject peek facts', () => {
  const projection = { prefixes: {}, predicates: [], rows: [{ subject: '#%E7%AC%AC%E4%B8%80%E8%A1%8C', cells: [] }], warnings: [] } as never

  it('decodes an untitled row name and names the table as its type', () => {
    const facts = deriveStructuredSubjectPeekFacts({
      projection,
      visibleProjection: projection,
      subject: '#%E7%AC%AC%E4%B8%80%E8%A1%8C',
      tableName: '任务',
    })
    expect(facts.title).toBe('第一行')
    expect(facts.typeName).toBe('任务')
  })
})
