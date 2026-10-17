import { describe, expect, it, vi } from 'vitest'
import { ODRL } from '@undefineds.co/models'
import {
  DRAFT_PENDING_NOTICE,
  executePodFileTool,
  isPodFileTool,
  podFileToolTarget,
  type PodFileToolContext,
} from '../pod-file-tools'

const POD = 'https://alice.example/'
const FILE = `${POD}docs/plan.md`

function context(overrides: Partial<PodFileToolContext> = {}) {
  const files = {
    stageAiDraft: vi.fn(async (_db: unknown, input: { delegated?: boolean }) => ({ state: input.delegated ? 'kept' : 'draft' })),
    writeAiCellChange: vi.fn(async () => ({})),
    stageAiColumnChange: vi.fn(async () => ({})),
    readRawTextResource: vi.fn(async (_db: unknown, uri: string) => ({ uri, mimeType: 'text/plain', etag: 'e', content: 'old' })),
    saveRawTextResource: vi.fn(async () => ({})),
    createRawTextResource: vi.fn(async () => ({})),
  }
  const ctx: PodFileToolContext = {
    db: {}, actorWebId: 'https://alice.example/profile#me', podRootUri: POD,
    grants: [], createdByLinx: new Set(), files, ...overrides,
  }
  return { ctx, files }
}

const grant = (action = ODRL.term('modify')) => ({ id: 'g1', target: `${POD}docs/`, action, riskCeiling: null })

describe('LinX file tools', () => {
  it('stages an edit to the person\'s file as an unconfirmed draft and says so', async () => {
    const { ctx, files } = context()
    const out = await executePodFileTool('files_edit', { uri: FILE, content: 'new' }, ctx)
    expect(out).toBe(DRAFT_PENDING_NOTICE)
    expect(out).toContain('已作为未确认草稿，等用户保留')
    expect(files.stageAiDraft).toHaveBeenCalledWith({}, expect.objectContaining({ targetResourceUri: FILE, draftContent: 'new', delegated: false }))
    expect(files.saveRawTextResource).not.toHaveBeenCalled()
  })

  it('keeps the edit at once when a grant covers the file', async () => {
    const { ctx, files } = context({ grants: [grant()] })
    const out = await executePodFileTool('files_edit', { uri: FILE, content: 'new' }, ctx)
    expect(files.stageAiDraft).toHaveBeenCalledWith({}, expect.objectContaining({ delegated: true }))
    expect(out).toContain('授权')
    expect(out).not.toContain('草稿')
  })

  it('ignores revoked grants and grants elsewhere', async () => {
    const { ctx, files } = context({ grants: [{ ...grant(), revokedAt: '2026-01-01' }, { ...grant(), id: 'g2', target: `${POD}other/` }] })
    await executePodFileTool('files_edit', { uri: FILE, content: 'new' }, ctx)
    expect(files.stageAiDraft).toHaveBeenCalledWith({}, expect.objectContaining({ delegated: false }))
  })

  it('writes files LinX created in this chat directly', async () => {
    const { ctx, files } = context()
    await executePodFileTool('files_create', { uri: FILE, content: 'a' }, ctx)
    expect(files.createRawTextResource).toHaveBeenCalled()
    const out = await executePodFileTool('files_edit', { uri: FILE, content: 'b' }, ctx)
    expect(files.stageAiDraft).not.toHaveBeenCalled()
    expect(files.saveRawTextResource).toHaveBeenCalledWith({}, expect.objectContaining({ uri: FILE }), 'b')
    expect(out).toContain('直接生效')
  })

  it('writes cells and new rows directly with an undo marker', async () => {
    const { ctx, files } = context()
    const out = await executePodFileTool('files_set_cell', { document: FILE, subject: 's', predicate: 'p', values: ['1'], row_added: true }, ctx)
    expect(files.writeAiCellChange).toHaveBeenCalledWith({}, expect.objectContaining({ documentUri: FILE, nextValues: ['1'], rowAdded: true }))
    expect(out).toContain('撤销')
  })

  it('adds a column unconfirmed, or at once under a grant', async () => {
    const plain = context()
    expect(await executePodFileTool('files_add_column', { document: FILE, predicate: 'p', label: '备注' }, plain.ctx)).toContain('未确认')
    expect(plain.files.stageAiColumnChange).toHaveBeenCalledWith({}, expect.objectContaining({ delegated: false }))
    const granted = context({ grants: [grant()] })
    expect(await executePodFileTool('files_add_column', { document: FILE, predicate: 'p', label: '备注' }, granted.ctx)).toContain('授权')
  })

  it('reports failures to the model instead of throwing, and exposes the target', async () => {
    const { ctx, files } = context()
    files.stageAiDraft.mockRejectedValueOnce(new Error('这个文件刚刚被改过'))
    expect(await executePodFileTool('files_edit', { uri: FILE, content: 'x' }, ctx)).toContain('没有写成')
    expect(isPodFileTool('files_edit')).toBe(true)
    expect(isPodFileTool('read_file')).toBe(false)
    expect(podFileToolTarget('files_set_cell', { document: FILE })).toBe(FILE)
    expect(podFileToolTarget('read_file', { uri: FILE })).toBeNull()
  })
})
