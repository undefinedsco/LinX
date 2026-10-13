import { describe, expect, it } from 'vitest'

import {
  aiCellKey,
  createAiCellChange,
  parseAiCellChangeLogTurtle,
  projectAiCellDotLabel,
  projectAiCellDots,
  renderAiCellChangeLogTurtle,
} from './ai-cell-change-model'

const DOC = 'https://pod.example/.data/team.ttl'

describe('ai cell change log', () => {
  it('round trips several records through turtle', () => {
    const first = createAiCellChange({
      documentUri: DOC,
      subject: `${DOC}#a`,
      predicate: 'http://schema.org/name',
      previousValues: ['"白露 \\"x\\""'],
      nextValues: ['"陆川"'],
      agentWebId: 'https://pod.example/agents/linx#me',
      createdAt: '2026-10-13T00:00:00.000Z',
    })
    const second = { ...createAiCellChange({
      documentUri: DOC,
      subject: `${DOC}#b`,
      predicate: 'http://schema.org/name',
      previousValues: [],
      nextValues: ['"新行"'],
      rowAdded: true,
      createdAt: '2026-10-13T00:01:00.000Z',
    }), state: 'seen' as const }
    expect(parseAiCellChangeLogTurtle(renderAiCellChangeLogTurtle([first, second]))).toEqual([first, second])
  })

  it('keeps a dot only for cells nobody has looked at or undone', () => {
    const base = { documentUri: DOC, subject: `${DOC}#a`, predicate: 'http://schema.org/name', previousValues: [], nextValues: ['"x"'] }
    const one = createAiCellChange({ ...base, createdAt: '2026-10-13T00:00:00.000Z' })
    const two = createAiCellChange({ ...base, subject: `${DOC}#b`, createdAt: '2026-10-13T00:00:01.000Z' })
    const dots = projectAiCellDots([one, { ...two, state: 'seen' }])
    expect([...dots.keys()]).toEqual([aiCellKey(one.subject, one.predicate)])
  })

  it('words the hover card', () => {
    const change = createAiCellChange({ documentUri: DOC, subject: `${DOC}#a`, predicate: 'p', previousValues: [], nextValues: [] })
    expect(projectAiCellDotLabel(change, '2')).toBe('LinX 改的 · 原来是 2')
    expect(projectAiCellDotLabel({ ...change, rowAdded: true }, '')).toBe('LinX 加的')
  })
})
