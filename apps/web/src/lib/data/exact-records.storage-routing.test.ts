import { describe, expect, it, vi } from 'vitest'
import { deleteExactRecord, updateExactRecord } from './exact-records'

const selectedSpPodUrl = 'https://node-0000.undefineds.co/alice/'
const cloudRecordIri = 'https://id.undefineds.co/alice/.data/chat/chat-1/index.ttl#this'
const localRecordIri = 'https://node-0000.undefineds.co/alice/.data/chat/chat-1/index.ttl#this'

describe('exact record storage routing', () => {
  it('allows absolute update/delete targets inside the current selected SP Pod', async () => {
    const updateByIri = vi.fn(async () => undefined)
    const deleteByIri = vi.fn(async () => undefined)
    const db = createDb({ updateByIri, deleteByIri })

    await updateExactRecord(db as any, {} as any, localRecordIri, { title: 'Local chat' })
    await deleteExactRecord(db as any, {} as any, localRecordIri)

    expect(updateByIri).toHaveBeenCalledWith({}, localRecordIri, { title: 'Local chat' })
    expect(deleteByIri).toHaveBeenCalledWith({}, localRecordIri)
  })

  it('refuses to update a Cloud-origin record after the session is rooted in a Local SP', async () => {
    const updateByIri = vi.fn(async () => undefined)
    const db = createDb({ updateByIri })

    await expect(
      updateExactRecord(db as any, {} as any, cloudRecordIri, { title: 'Wrong space' }),
    ).rejects.toThrow('outside the current SP')

    expect(updateByIri).not.toHaveBeenCalled()
  })

  it('refuses a stale absolute IRI even when only id-based mutation is available', async () => {
    const updateById = vi.fn(async () => undefined)
    const deleteById = vi.fn(async () => undefined)
    const db = createDb({ updateById, deleteById })
    const staleRecord = {
      id: 'approval-cloud',
      '@id': cloudRecordIri,
    }

    await expect(
      updateExactRecord(db as any, {} as any, staleRecord, { title: 'Wrong space' }),
    ).rejects.toThrow('outside the current SP')
    await expect(
      deleteExactRecord(db as any, {} as any, staleRecord),
    ).rejects.toThrow('outside the current SP')

    expect(updateById).not.toHaveBeenCalled()
    expect(deleteById).not.toHaveBeenCalled()
  })

  it('refuses to delete an absolute record when the current SP Pod URL is unavailable', async () => {
    const deleteByIri = vi.fn(async () => undefined)
    const db = createDb({ podUrl: null, deleteByIri })

    await expect(
      deleteExactRecord(db as any, {} as any, localRecordIri),
    ).rejects.toThrow('without a current SP Pod URL')

    expect(deleteByIri).not.toHaveBeenCalled()
  })

  it('refuses id-based update/delete when the current SP Pod URL is unavailable', async () => {
    const updateById = vi.fn(async () => undefined)
    const deleteById = vi.fn(async () => undefined)
    const db = createDb({ podUrl: null, updateById, deleteById })

    await expect(
      updateExactRecord(db as any, {} as any, 'chat-1', { title: 'Unknown space' }),
    ).rejects.toThrow('without a current SP Pod URL')
    await expect(
      deleteExactRecord(db as any, {} as any, 'chat-1'),
    ).rejects.toThrow('without a current SP Pod URL')

    expect(updateById).not.toHaveBeenCalled()
    expect(deleteById).not.toHaveBeenCalled()
  })

  it('keeps base-relative ids on the database current Pod path', async () => {
    const updateById = vi.fn(async () => undefined)
    const deleteById = vi.fn(async () => undefined)
    const db = createDb({ updateById, deleteById })

    await updateExactRecord(db as any, {} as any, 'chat-1', { title: 'Current SP' })
    await deleteExactRecord(db as any, {} as any, 'chat-1')

    expect(updateById).toHaveBeenCalledWith({}, 'chat-1', { title: 'Current SP' })
    expect(deleteById).toHaveBeenCalledWith({}, 'chat-1')
  })

  it('refuses an update payload that points a business relation outside the selected SP', async () => {
    const updateById = vi.fn(async () => undefined)
    const db = createDb({ updateById })

    await expect(
      updateExactRecord(db as any, {} as any, 'chat-1', {
        thread: 'https://id.undefineds.co/alice/.data/chat/chat-1/index.ttl#thread-1',
      }),
    ).rejects.toThrow('outside the current SP')

    expect(updateById).not.toHaveBeenCalled()
  })
})

function createDb(options: {
  podUrl?: string | null
  updateByIri?: (...args: any[]) => Promise<void>
  deleteByIri?: (...args: any[]) => Promise<void>
  updateById?: (...args: any[]) => Promise<void>
  deleteById?: (...args: any[]) => Promise<void>
}) {
  return {
    getDialect: () => ({
      getPodUrl: () => options.podUrl === undefined ? selectedSpPodUrl : options.podUrl,
    }),
    updateByIri: options.updateByIri,
    deleteByIri: options.deleteByIri,
    updateById: options.updateById,
    deleteById: options.deleteById,
  }
}
