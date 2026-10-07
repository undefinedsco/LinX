import { describe, expect, it } from 'vitest'

import type { StructuredTableProjection } from '../../domain/structured/structured-table'
import {
  projectStructuredAlternativeSubjectOpenRequest,
  projectStructuredScrollRestorationTargetSignature,
  resolveStructuredSamePodSourceResourceUri,
} from './structured-subject-navigation-model'

const documentUri = 'https://pod.example/.data/tasks.ttl'

const projection: StructuredTableProjection = {
  prefixes: {},
  predicates: ['title'],
  rows: [
    { subject: '#TaskA', cells: [{ predicate: 'title', values: ['"Alpha"'] }] },
    { subject: '#TaskB', cells: [{ predicate: 'title', values: ['"Beta"'] }] },
  ],
  warnings: [],
}

describe('structured-subject-navigation-model', () => {
  it('projects scroll restoration target signatures for the active document only', () => {
    expect(projectStructuredScrollRestorationTargetSignature({
      documentUri,
      scrollRestoration: {
        documentUri,
        subject: '#TaskB',
        scrollTop: 144,
        rowIndex: 1,
      },
      tableProjection: projection,
    })).toBe('0:#TaskA\u00001:#TaskB')

    expect(projectStructuredScrollRestorationTargetSignature({
      documentUri,
      scrollRestoration: {
        documentUri: 'https://pod.example/.data/other.ttl',
        subject: '#TaskB',
        scrollTop: 144,
      },
      tableProjection: projection,
    })).toBe('')
  })

  it('projects alternative-view subject open requests and disables direct navigation for external targets', () => {
    expect(projectStructuredAlternativeSubjectOpenRequest({
      documentUri,
      projection,
      subject: 'https://outside.example/report.pdf',
      options: {
        navigate: true,
        rowIndex: 2,
        scrollTop: 80,
      },
    })).toEqual({
      subject: 'https://outside.example/report.pdf',
      targetUri: 'https://outside.example/report.pdf',
      kind: 'external',
      options: {
        navigate: false,
        rowIndex: 2,
        scrollTop: 80,
      },
    })
  })

  it('falls back unresolved local subjects to the containing document peek target', () => {
    expect(projectStructuredAlternativeSubjectOpenRequest({
      documentUri,
      projection,
      subject: '#Missing',
    })).toEqual({
      subject: '#Missing',
      targetUri: documentUri,
      kind: 'resource',
      options: undefined,
    })
  })

  it('resolves same-Pod source resources while rejecting external or fragment targets', () => {
    expect(resolveStructuredSamePodSourceResourceUri(
      documentUri,
      'https://pod.example/public/report.md',
    )).toBe('https://pod.example/public/report.md')

    expect(resolveStructuredSamePodSourceResourceUri(
      documentUri,
      'https://outside.example/report.md',
    )).toBeNull()
    expect(resolveStructuredSamePodSourceResourceUri(
      documentUri,
      'https://pod.example/public/report.md#section',
    )).toBeNull()
    expect(resolveStructuredSamePodSourceResourceUri(documentUri, 'not a url')).toBeNull()
  })
})
