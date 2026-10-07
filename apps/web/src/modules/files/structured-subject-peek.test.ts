import { describe, expect, it } from 'vitest'
import { resolveStructuredRelationOpenTarget } from './domain/structured/structured-subject-peek'

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
