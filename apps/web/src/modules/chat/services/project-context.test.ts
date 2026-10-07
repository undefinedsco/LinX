import { beforeEach, describe, expect, it, vi } from 'vitest'

const shared = vi.hoisted(() => ({
  read: vi.fn(),
  reconcile: vi.fn(),
}))

vi.mock('@undefineds.co/models', async (importOriginal) => ({
  ...await importOriginal<typeof import('@undefineds.co/models')>(),
  readChatProjectContext: shared.read,
  reconcileChatProjectContext: shared.reconcile,
}))

import { emptyProjectContext, readProjectContext, renderProjectSystemContext, writeProjectContext } from './project-context'

describe('chat project context adapter', () => {
  beforeEach(() => vi.clearAllMocks())

  it('delegates typed Pod persistence to the shared models use-case', async () => {
    const db = {} as import('@undefineds.co/models').SolidDatabase
    const context = {
      ...emptyProjectContext('https://pod.example/workspace/one/'),
      instructions: 'Prefer concise answers.',
      memories: [{ id: 'memory-1.ttl', text: 'The release day is Friday.', createdAt: '2026-08-11T00:00:00Z' }],
    }
    shared.reconcile.mockResolvedValue(context)
    shared.read.mockResolvedValue(context)

    await expect(writeProjectContext({ db, previous: context, context })).resolves.toEqual(context)
    await expect(readProjectContext({ db, workspaceUri: context.workspace })).resolves.toEqual(context)
    expect(shared.reconcile).toHaveBeenCalledWith(db, { previous: context, next: context })
    expect(shared.read).toHaveBeenCalledWith(db, context.workspace)
    expect(renderProjectSystemContext(context)).toContain('Prefer concise answers.')
    expect(renderProjectSystemContext(context)).toContain('The release day is Friday.')
  })

  it('omits saved memories when memory is disabled', () => {
    expect(renderProjectSystemContext({
      ...emptyProjectContext('workspace'),
      memoryEnabled: false,
      memories: [{ id: 'm', text: 'private memory', createdAt: 'now' }],
    })).not.toContain('private memory')
  })
})
