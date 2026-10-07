import { describe, expect, it } from 'vitest'

import type { StructuredSubjectPeek } from '../../domain/structured/structured-subject-peek'
import { projectStructuredSubjectPeekActions } from './structured-subject-peek-actions-model'

const ghostActionClassName = 'rounded-md px-2 py-1 text-[11px] text-muted-foreground hover:bg-muted/70'
const primaryActionClassName = 'rounded-md bg-primary px-2 py-1 text-[11px] font-medium text-primary-foreground hover:bg-primary/90'

function peek(overrides: Partial<NonNullable<StructuredSubjectPeek>>): NonNullable<StructuredSubjectPeek> {
  return {
    subject: 'https://pod.example/.data/tasks.ttl#Task',
    targetUri: 'https://pod.example/.data/tasks.ttl',
    kind: 'resource',
    rowIndex: 0,
    scrollTop: 0,
    title: 'Task',
    className: 'https://schema.org/Task',
    summary: '',
    source: '',
    sourceLinkedCard: null,
    facts: [],
    predicates: [],
    backlinks: [],
    ...overrides,
  }
}

describe('projectStructuredSubjectPeekActions', () => {
  it('projects resource peek actions with sidecar, optional source, and primary open affordance', () => {
    expect(projectStructuredSubjectPeekActions({
      peek: peek({ kind: 'resource', source: 'https://example.com/source' }),
      targetIsCurrentFile: false,
    })).toEqual([
      { kind: 'resource-sidecar' },
      { kind: 'cancel', label: '取消', variant: 'ghost', className: ghostActionClassName },
      { kind: 'open-source', label: '打开来源', variant: 'ghost', className: ghostActionClassName },
      { kind: 'primary-open', label: '打开资源', variant: 'primary', className: primaryActionClassName },
    ])
  })

  it('projects external and term peek actions without leaking kind branches into preview containers', () => {
    expect(projectStructuredSubjectPeekActions({
      peek: peek({ kind: 'external', source: '' }),
      targetIsCurrentFile: false,
    })).toEqual([
      { kind: 'copy-external', label: '复制 URL', variant: 'ghost', className: ghostActionClassName },
      { kind: 'cancel', label: '取消', variant: 'ghost', className: ghostActionClassName },
      { kind: 'primary-open', label: '打开 URL', variant: 'primary', className: primaryActionClassName },
    ])

    expect(projectStructuredSubjectPeekActions({
      peek: peek({ kind: 'term', source: '' }),
      targetIsCurrentFile: false,
    })).toEqual([
      { kind: 'cancel', label: '取消', variant: 'ghost', className: ghostActionClassName },
      { kind: 'primary-open', label: '打开承载文件', variant: 'primary', className: primaryActionClassName },
    ])
  })

  it('projects a single close action when the term already targets the current file', () => {
    expect(projectStructuredSubjectPeekActions({
      peek: peek({ kind: 'term' }),
      targetIsCurrentFile: true,
    })).toEqual([
      { kind: 'close', label: '关闭', variant: 'primary', className: primaryActionClassName },
    ])
  })

  it('returns no actions when there is no active peek', () => {
    expect(projectStructuredSubjectPeekActions({
      peek: null,
      targetIsCurrentFile: false,
    })).toEqual([])
  })
})
