import { describe, expect, it } from 'vitest'

import {
  createAiColumnChange,
  parseAiColumnChangeLogTurtle,
  projectAiColumnNotice,
  projectAiColumns,
  renderAiColumnChangeLogTurtle,
} from './ai-column-change-model'

const DOC = 'https://pod.example/.data/team.ttl'

describe('ai column change log', () => {
  it('starts unconfirmed without a grant and added with one', () => {
    const base = { documentUri: DOC, predicate: 'http://schema.org/skill', label: '擅长' }
    expect(createAiColumnChange(base).state).toBe('unconfirmed')
    expect(createAiColumnChange({ ...base, delegated: true }).state).toBe('added')
  })

  it('round trips through turtle', () => {
    const first = createAiColumnChange({
      documentUri: DOC,
      predicate: 'http://schema.org/skill',
      label: '擅长 "x"',
      agentWebId: 'https://pod.example/agents/linx#me',
      createdAt: '2026-10-17T00:00:00.000Z',
    })
    const second = {
      ...createAiColumnChange({ documentUri: DOC, predicate: 'http://schema.org/channel', label: '报名渠道', delegated: true, createdAt: '2026-10-17T00:00:01.000Z' }),
      state: 'kept' as const,
    }
    expect(parseAiColumnChangeLogTurtle(renderAiColumnChangeLogTurtle([first, second]))).toEqual([first, second])
  })

  it('keeps only columns still marked, latest record wins', () => {
    const a = createAiColumnChange({ documentUri: DOC, predicate: 'p:a', label: 'A', createdAt: '1' })
    const b = createAiColumnChange({ documentUri: DOC, predicate: 'p:b', label: 'B', delegated: true, createdAt: '2' })
    const aRemoved = { ...a, id: 'k-later', state: 'removed' as const }
    expect(Array.from(projectAiColumns([a, b, aRemoved]).keys())).toEqual(['p:b'])
    expect(projectAiColumnNotice(b)).toContain('“B”')
  })
})
