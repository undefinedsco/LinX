import { describe, expect, it, vi } from 'vitest'
import { FilesSaveConflictError, readRawTextResource, saveRawTextResource } from './data/pod-adapter'
import { markFilesProposalResourceResolved } from './data/proposal/proposal-status-resource'
import { updateProposalStatusInTurtle } from './domain/proposal/proposal-status'

vi.mock('./data/pod-adapter', () => ({
  FilesSaveConflictError: class FilesSaveConflictError extends Error {
    constructor(uri: string) {
      super(`保存冲突：${uri} 已被其他客户端修改。`)
      this.name = 'FilesSaveConflictError'
    }
  },
  readRawTextResource: vi.fn(),
  saveRawTextResource: vi.fn(),
}))

const readRawTextResourceMock = vi.mocked(readRawTextResource)
const saveRawTextResourceMock = vi.mocked(saveRawTextResource)

describe('files proposal status helpers', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('updates an existing udfs status literal', () => {
    expect(updateProposalStatusInTurtle([
      '@prefix udfs: <https://undefineds.co/vocab/> .',
      '',
      '<#proposal> a udfs:AiChangeProposal ;',
      '  udfs:status "pending" ;',
      '  udfs:operation "replace-content" .',
    ].join('\n'), 'approved')).toContain('udfs:status "approved"')
  })

  it('inserts a status literal when older proposal resources do not have one', () => {
    const next = updateProposalStatusInTurtle([
      '@prefix udfs: <https://undefineds.co/vocab/> .',
      '',
      '<#proposal> a udfs:AccessPolicyProposal ;',
      '  udfs:operation "request-change" .',
    ].join('\n'), 'rejected')

    expect(next).toContain('<#proposal> a udfs:AccessPolicyProposal ;')
    expect(next).toContain('udfs:status "rejected"')
    expect(next).toContain('udfs:operation "request-change"')
  })

  it('updates expanded status predicates without requiring a prefix declaration', () => {
    const next = updateProposalStatusInTurtle([
      '<https://pod.example/.data/proposals/source/report.ttl#proposal> <https://undefineds.co/vocab/status> "pending" .',
      '<https://pod.example/.data/proposals/source/report.ttl#proposal> <https://undefineds.co/vocab/operation> "refresh-card" .',
    ].join('\n'), 'approved')

    expect(next).toContain('<https://undefineds.co/vocab/status> "approved"')
    expect(next).not.toContain('udfs:status "approved"')
  })

  it('inserts an expanded status triple when provider-normalized proposal resources do not have one', () => {
    const next = updateProposalStatusInTurtle([
      '<https://pod.example/.data/proposals/source/report.ttl#proposal> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <https://undefineds.co/vocab/SourceUpdateProposal> .',
      '<https://pod.example/.data/proposals/source/report.ttl#proposal> <https://undefineds.co/vocab/operation> "refresh-card" .',
    ].join('\n'), 'approved')

    expect(next).toContain('<https://pod.example/.data/proposals/source/report.ttl#proposal> <https://undefineds.co/vocab/status> "approved" .')
    expect(next).toContain('<https://undefineds.co/vocab/operation> "refresh-card"')
  })

  it('retries status resolution on a stale proposal resource etag while the proposal is still pending', async () => {
    const proposalUri = 'https://pod.example/.data/proposals/source/report.ttl'
    const pendingSource = [
      '@prefix udfs: <https://undefineds.co/vocab/> .',
      '',
      '<#proposal> a udfs:SourceUpdateProposal ;',
      '  udfs:status "pending" ;',
      '  udfs:operation "refresh-card" .',
    ].join('\n')

    readRawTextResourceMock
      .mockResolvedValueOnce({
        uri: proposalUri,
        content: pendingSource,
        mimeType: 'text/turtle',
        etag: '"proposal-old"',
        headers: { etag: '"proposal-old"' },
      })
      .mockResolvedValueOnce({
        uri: proposalUri,
        content: pendingSource,
        mimeType: 'text/turtle',
        etag: '"proposal-new"',
        headers: { etag: '"proposal-new"' },
      })
    saveRawTextResourceMock
      .mockRejectedValueOnce(new FilesSaveConflictError(proposalUri))
      .mockResolvedValueOnce({
        uri: proposalUri,
        content: pendingSource.replace('udfs:status "pending"', 'udfs:status "rejected"'),
        mimeType: 'text/turtle',
        etag: '"proposal-resolved"',
        headers: { etag: '"proposal-resolved"' },
      })

    await expect(markFilesProposalResourceResolved(
      { id: 'db' } as never,
      `${proposalUri}#proposal`,
      'rejected',
    )).resolves.toBeUndefined()

    expect(readRawTextResourceMock).toHaveBeenCalledTimes(2)
    expect(saveRawTextResourceMock).toHaveBeenCalledTimes(2)
    expect(saveRawTextResourceMock).toHaveBeenLastCalledWith(
      { id: 'db' },
      expect.objectContaining({ uri: proposalUri, etag: '"proposal-new"' }),
      expect.stringContaining('udfs:status "rejected"'),
    )
  })
})
