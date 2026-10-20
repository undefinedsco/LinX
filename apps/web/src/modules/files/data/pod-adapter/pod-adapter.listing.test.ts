import { afterEach, describe, expect, it, vi } from 'vitest'

import { buildRootNodes, listAllBrowsableEntries } from './index'

const ROOT = 'https://pod.example/alice/'
const WORKSPACE = `${ROOT}.data/workspaces/topic-1/`

function fakeDb(listing: (containerUri: string) => Promise<string[]>) {
  return {
    getDialect: () => ({
      getPodUrl: () => ROOT,
      listContainerResources: listing,
    }),
  } as never
}

const ROOT_RESOURCES = [
  `${ROOT}.data/`,
  `${ROOT}agents/`,
  `${ROOT}profile/`,
  `${ROOT}settings/`,
  `${ROOT}inbox/`,
  `${ROOT}notes/`,
  `${ROOT}README`,
]

afterEach(() => {
  vi.useRealTimers()
})

describe('Files Pod listing', () => {
  it('hides the app-internal Pod containers but keeps the person\'s own folders', async () => {
    const db = fakeDb(async (uri) => (uri === ROOT ? ROOT_RESOURCES : []))

    const entries = await listAllBrowsableEntries(db, null, {})
    expect(entries.map((entry) => entry.uri).sort()).toEqual([`${ROOT}.data/`, `${ROOT}README`, `${ROOT}notes/`].sort())

    const roots = await buildRootNodes(db, null)
    expect(roots.entries.map((entry) => entry.uri)).not.toContain(`${ROOT}agents/`)
    expect(roots.entries.map((entry) => entry.uri)).toContain(`${ROOT}.data/`)
  })

  it('keeps system containers out of recursive search listings too', async () => {
    const db = fakeDb(async (uri) => {
      if (uri === ROOT) return ROOT_RESOURCES
      if (uri === `${ROOT}notes/`) return [`${ROOT}notes/settings/`, `${ROOT}notes/a.md`]
      return []
    })

    const uris = (await listAllBrowsableEntries(db, null, { recursive: true })).map((entry) => entry.uri)
    expect(uris).toEqual(expect.arrayContaining([`${ROOT}notes/settings/`, `${ROOT}notes/a.md`]))
    for (const name of ['agents', 'profile', 'settings', 'inbox']) expect(uris).not.toContain(`${ROOT}${name}/`)
  })

  it('does not wait for, or fail on, a missing or slow current-topic folder', async () => {
    vi.useFakeTimers()
    const hanging = fakeDb((uri) => (uri === WORKSPACE ? new Promise<string[]>(() => undefined) : Promise.resolve([`${ROOT}notes/`])))
    const all = listAllBrowsableEntries(hanging, WORKSPACE, {})
    const roots = buildRootNodes(hanging, WORKSPACE)
    await vi.advanceTimersByTimeAsync(2_500)
    expect((await all).map((entry) => entry.uri)).toEqual([`${ROOT}notes/`])
    expect((await roots).entries.map((entry) => entry.uri)).toEqual([`${ROOT}notes/`])

    const failing = fakeDb((uri) => (uri === WORKSPACE ? Promise.reject(new Error('HTTP 404')) : Promise.resolve([`${ROOT}notes/`])))
    expect((await listAllBrowsableEntries(failing, WORKSPACE, {})).map((entry) => entry.uri)).toEqual([`${ROOT}notes/`])
  })
})
