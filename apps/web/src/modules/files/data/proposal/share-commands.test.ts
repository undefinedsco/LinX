import { beforeEach, describe, expect, it, vi } from 'vitest'

const adapter = vi.hoisted(() => ({
  readFilesAccessBasics: vi.fn(),
  readRawTextResource: vi.fn(),
  saveRawTextResource: vi.fn(),
  createRawTextResource: vi.fn(),
}))
vi.mock('../pod-adapter', () => adapter)
vi.mock('../pod-adapter/pod-runtime', () => ({
  getPodRootUri: () => 'https://lin.pod.example/',
  getAuthenticatedFetch: () => vi.fn(async () => new Response(null, { status: 204 })),
}))
vi.mock('@/lib/data/current-pod-base', () => ({ resolveCurrentPodBaseUrl: () => 'https://lin.pod.example' }))

import { applyShareChange, readShareState } from './share-commands'

const ME = 'https://lin.pod.example/profile/card#me'
const ZHOU = 'https://zhou.pod.example/profile/card#me'
const db = {} as never
const uri = 'https://lin.pod.example/profile/card'

const access = (activeUri: string | null, grants: unknown[] = []) => ({
  ownerUri: uri,
  activeSource: activeUri ? { provider: 'acl', uri: activeUri, confidence: 'linked', inheritance: 'direct' } : null,
  effectiveAccess: null,
  policySummary: activeUri ? { uri: activeUri, provider: 'acl', state: 'exists', grants } : null,
  candidates: [],
})

describe('share commands through the access policy', () => {
  beforeEach(() => vi.clearAllMocks())

  it('lets the owner manage profile/card even when no ACL is readable', async () => {
    adapter.readFilesAccessBasics.mockResolvedValue(access(null))
    const state = await readShareState(db, uri, false, ME)
    expect(state.canManage).toBe(true)
    adapter.readFilesAccessBasics.mockRejectedValue(new Error('HTTP 403'))
    expect((await readShareState(db, uri, false, ME)).canManage).toBe(true)
  })

  it('marks another Pod\'s item as not manageable', async () => {
    adapter.readFilesAccessBasics.mockResolvedValue(access(null))
    expect((await readShareState(db, 'https://zhou.pod.example/a.md', false, ME)).canManage).toBe(false)
  })

  it('creates the item\'s own .acl when it only inherits rules', async () => {
    adapter.readFilesAccessBasics.mockResolvedValue(access('https://lin.pod.example/profile/.acl', [
      { audience: 'agent', audienceRef: ME, modes: { read: true, append: true, write: true, control: true } },
    ]))
    await applyShareChange(db, { uri, isFolder: false, change: { type: 'person', webId: ZHOU, role: 'view' }, selfWebId: ME })
    expect(adapter.createRawTextResource).toHaveBeenCalledTimes(1)
    const [, resource, content] = adapter.createRawTextResource.mock.calls[0]
    expect(resource.uri).toBe(`${uri}.acl`)
    expect(content).toContain(`acl:agent <${ZHOU}>`)
    expect(content).toContain(`acl:agent <${ME}>`)
  })

  it('rewrites an existing own .acl and revokes at once', async () => {
    adapter.readFilesAccessBasics.mockResolvedValue(access(`${uri}.acl`, [
      { audience: 'agent', audienceRef: ME, modes: { read: true, append: true, write: true, control: true } },
      { audience: 'agent', audienceRef: ZHOU, modes: { read: true, append: false, write: false, control: false } },
    ]))
    adapter.readRawTextResource.mockResolvedValue({ uri: `${uri}.acl`, mimeType: 'text/turtle', etag: '"1"', content: '' })
    await applyShareChange(db, { uri, isFolder: false, change: { type: 'person', webId: ZHOU, role: null }, selfWebId: ME })
    const [, , content] = adapter.saveRawTextResource.mock.calls[0]
    expect(content).not.toContain(ZHOU)
    expect(content).toContain(ME)
  })

  it('refuses to change an item in another Pod without control', async () => {
    adapter.readFilesAccessBasics.mockResolvedValue(access(null))
    await expect(applyShareChange(db, { uri: 'https://zhou.pod.example/a.md', isFolder: false, change: { type: 'link', on: true }, selfWebId: ME }))
      .rejects.toThrow(/403/)
  })
})
