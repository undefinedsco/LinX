import { beforeEach, describe, expect, it, vi } from 'vitest'

const shared = vi.hoisted(() => ({
  read: vi.fn(),
  write: vi.fn(),
}))

vi.mock('@undefineds.co/models', async (importOriginal) => ({
  ...await importOriginal<typeof import('@undefineds.co/models')>(),
  readChatProjectContext: shared.read,
  writeChatProjectContext: shared.write,
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
    shared.write.mockResolvedValue(context)
    shared.read.mockResolvedValue(context)

    await expect(writeProjectContext({ db, context })).resolves.toEqual(context)
    await expect(readProjectContext({ db, workspaceUri: context.workspace })).resolves.toEqual(context)
    expect(shared.write).toHaveBeenCalledWith(db, context)
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
