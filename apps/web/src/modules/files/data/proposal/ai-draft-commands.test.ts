import { beforeEach, describe, expect, it, vi } from 'vitest'

const adapter = vi.hoisted(() => ({
  createRawTextResource: vi.fn(),
  listContainerResourceUris: vi.fn(),
  readRawTextResource: vi.fn(),
  saveRawTextResource: vi.fn(),
}))
vi.mock('../pod-adapter', () => adapter)
vi.mock('@/lib/data/pod-write-guard', () => ({ assertInsertValuesBelongToCurrentPod: vi.fn() }))

import { aiDraftResourceUri, createAiDraft, renderAiDraftTurtle } from '../../domain/proposal/ai-draft-model'
import { listUnconfirmedAiDraftTargets } from './ai-draft-commands'

const POD = 'https://pod.example/'
const db = {} as never
const plan = `${POD}docs/plan.md`
const notes = `${POD}docs/notes.md`
const other = `${POD}docs/other.md`

function turtleFor(target: string, overrides: Parameters<typeof createAiDraft>[0] extends infer T ? Partial<T> : never = {}) {
  return renderAiDraftTurtle(createAiDraft({
    targetResourceUri: target,
    baseContent: 'a\n',
    draftContent: 'b\n',
    podRootUri: POD,
    ...overrides,
  }))
}

describe('listUnconfirmedAiDraftTargets', () => {
  beforeEach(() => vi.clearAllMocks())

  it('lists the draft container once and reads only the drafts that exist', async () => {
    adapter.listContainerResourceUris.mockResolvedValue([aiDraftResourceUri(plan, POD), aiDraftResourceUri(notes, POD)])
    adapter.readRawTextResource.mockImplementation(async (_db: unknown, uri: string) => ({
      uri,
      content: uri === aiDraftResourceUri(plan, POD)
        ? turtleFor(plan)
        : turtleFor(notes, { delegated: true }),
    }))

    const targets = await listUnconfirmedAiDraftTargets(db, [plan, notes, other], POD)

    expect(Array.from(targets)).toEqual([plan])
    expect(adapter.listContainerResourceUris).toHaveBeenCalledTimes(1)
    expect(adapter.readRawTextResource).toHaveBeenCalledTimes(2)
  })

  it('treats a missing draft container as nothing to show', async () => {
    adapter.listContainerResourceUris.mockRejectedValue(new Error('HTTP 404'))
    expect((await listUnconfirmedAiDraftTargets(db, [plan], POD)).size).toBe(0)
  })

  it('does not look anything up for folders', async () => {
    expect((await listUnconfirmedAiDraftTargets(db, [`${POD}docs/`], POD)).size).toBe(0)
    expect(adapter.listContainerResourceUris).not.toHaveBeenCalled()
  })
})
