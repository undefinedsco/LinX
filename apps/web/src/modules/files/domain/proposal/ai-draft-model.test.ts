import { describe, expect, it } from 'vitest'

import {
  countAiDraftSpots,
  createAiDraft,
  parseAiDraftTurtle,
  projectAiDraftBanner,
  projectAiDraftMessageBar,
  renderAiDraftTurtle,
  revertAiDraftSpot,
} from './ai-draft-model'

const BASE = '# 方案\n\n截止 2 天\n\n名额满了停止报名\n'
const DRAFT = '# 方案\n\n截止 3 天\n\n名额满了停止报名\n\n新增提醒\n'

describe('ai draft model', () => {
  it('counts changed spots and reverts them one at a time', () => {
    expect(countAiDraftSpots(BASE, DRAFT)).toBe(2)
    expect(revertAiDraftSpot(BASE, DRAFT, 0)).toBe('# 方案\n\n截止 2 天\n\n名额满了停止报名\n\n新增提醒\n')
    expect(revertAiDraftSpot(BASE, DRAFT, 1)).toBe('# 方案\n\n截止 3 天\n\n名额满了停止报名\n')
    expect(countAiDraftSpots(BASE, BASE)).toBe(0)
  })

  it('round trips through turtle, including quotes and newlines', () => {
    const draft = createAiDraft({
      targetResourceUri: 'https://pod.example/a/报名方案.md',
      baseContent: '说 "好"\n\\n 路径',
      draftContent: DRAFT,
      agentWebId: 'https://pod.example/agents/linx#me',
      podRootUri: 'https://pod.example/',
      now: '2026-10-13T00:00:00.000Z',
    })
    expect(draft.resourceUri).toMatch(/^https:\/\/pod\.example\/\.data\/proposals\/draft\/.+\.ttl$/)
    const parsed = parseAiDraftTurtle(renderAiDraftTurtle(draft), draft.resourceUri)
    expect(parsed).toEqual(draft)
  })

  it('keeps the first original while LinX keeps editing an unconfirmed draft', () => {
    const first = createAiDraft({ targetResourceUri: 'https://p/a.md', baseContent: BASE, draftContent: DRAFT, podRootUri: 'https://p/' })
    const second = createAiDraft({
      targetResourceUri: 'https://p/a.md',
      baseContent: DRAFT,
      draftContent: `${DRAFT}更多\n`,
      podRootUri: 'https://p/',
      previous: first,
    })
    expect(second.baseContent).toBe(BASE)
    expect(second.state).toBe('draft')
  })

  it('words the top line for each state', () => {
    const draft = createAiDraft({ targetResourceUri: 'https://p/a.md', baseContent: BASE, draftContent: DRAFT, podRootUri: 'https://p/' })
    expect(projectAiDraftBanner(draft)).toMatchObject({ text: 'LinX 改了 2 处，还没确认', actions: ['undo', 'keep'] })
    expect(projectAiDraftMessageBar(draft)).toEqual({ text: '改了 2 处 · 还没确认', actions: ['undo', 'keep'] })
    const kept = { ...draft, state: 'kept' as const }
    expect(projectAiDraftBanner(kept, DRAFT)).toMatchObject({ text: 'LinX 改了 2 处，已保留', actions: ['undo'] })
    expect(projectAiDraftBanner(kept, 'someone edited')?.actions).toEqual([])
    expect(projectAiDraftBanner({ ...draft, state: 'undone' })).toMatchObject({ text: '已回到原样', actions: ['redo'] })
  })

  it('a delegated change is kept at once', () => {
    const draft = createAiDraft({ targetResourceUri: 'https://p/a.md', baseContent: BASE, draftContent: DRAFT, delegated: true, podRootUri: 'https://p/' })
    expect(draft.state).toBe('kept')
  })
})
