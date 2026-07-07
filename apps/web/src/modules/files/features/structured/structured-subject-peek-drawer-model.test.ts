import { describe, expect, it } from 'vitest'

import type { StructuredSubjectPeek } from '../../domain/structured/structured-subject-peek'
import { projectStructuredSubjectPeekDrawerChrome } from './structured-subject-peek-drawer-model'

const basePeek: NonNullable<StructuredSubjectPeek> = {
  subject: '#Task',
  targetUri: 'https://pod.example/.data/tasks.ttl#Task',
  kind: 'resource',
  rowIndex: 0,
  scrollTop: 0,
  title: 'Task',
  className: null,
  summary: null,
  source: null,
  sourceLinkedCard: null,
  facts: [],
  predicates: [],
  backlinks: [],
}

describe('projectStructuredSubjectPeekDrawerChrome', () => {
  it('projects drawer title, aria labels, and icon kind for resource subjects', () => {
    expect(projectStructuredSubjectPeekDrawerChrome(basePeek)).toEqual({
      closeAriaLabel: 'Close subject peek',
      drawerAriaLabel: 'Structured subject peek',
      iconKind: 'info',
      title: '卡片预览',
    })
  })

  it('projects term and external drawer chrome without leaving kind checks in the renderer', () => {
    expect(projectStructuredSubjectPeekDrawerChrome({
      ...basePeek,
      kind: 'term',
    })).toEqual({
      closeAriaLabel: 'Close term peek',
      drawerAriaLabel: 'Structured term peek',
      iconKind: 'info',
      title: '定义预览',
    })

    expect(projectStructuredSubjectPeekDrawerChrome({
      ...basePeek,
      kind: 'external',
    })).toEqual({
      closeAriaLabel: 'Close subject peek',
      drawerAriaLabel: 'Structured subject peek',
      iconKind: 'external-link',
      title: '链接预览',
    })
  })
})
