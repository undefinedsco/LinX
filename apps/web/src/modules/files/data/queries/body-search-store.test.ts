import { describe, expect, it, vi } from 'vitest'
import { BodySearchStore, type BodySearchEntry, type BodySearchPersistence } from './body-search-store'

function entry(name: string, extra: Partial<BodySearchEntry> = {}): BodySearchEntry {
  return {
    id: name,
    uri: `https://pod.example/${name}`,
    name,
    kind: 'resource',
    semanticKind: 'file',
    mimeType: name.endsWith('.md') ? 'text/markdown' : name.endsWith('.pdf') ? 'application/pdf' : 'text/plain',
    size: 10,
    modifiedAt: '2026-01-01',
    ...extra,
  }
}

function memoryPersistence() {
  const saved = new Map<string, unknown[]>()
  const persistence: BodySearchPersistence = {
    load: async (key) => (saved.get(key) ?? []) as never,
    save: vi.fn(async (key, docs) => { saved.set(key, docs) }),
  }
  return { persistence, saved }
}

describe('BodySearchStore', () => {
  it('indexes readable files only, reports the rest as name-only', async () => {
    const { persistence } = memoryPersistence()
    const store = new BodySearchStore('pod', persistence)
    const reads: string[] = []
    const entries = [entry('a.md'), entry('b.txt'), entry('c.pdf'), entry('d.pdf'), entry('folder', { kind: 'container' })]
    await store.sync(entries, async (uri) => { reads.push(uri); return '志愿者排班方案' })
    expect(reads).toHaveLength(2)
    const snap = store.getSnapshot()
    expect(snap.coverage).toEqual({ totalFiles: 4, indexedFiles: 2, indexing: false })
    expect(snap.note).toBe('还有 2 个文件的正文没建索引，只按名字找')
    expect(store.search('排班')).toHaveLength(2)
  })

  it('does not re-read unchanged files and re-reads changed ones', async () => {
    const { persistence } = memoryPersistence()
    const store = new BodySearchStore('pod', persistence)
    const readText = vi.fn(async () => '苹果')
    await store.sync([entry('a.md')], readText)
    await store.sync([entry('a.md')], readText)
    expect(readText).toHaveBeenCalledTimes(1)
    const next = vi.fn(async () => '香蕉')
    await store.sync([entry('a.md', { modifiedAt: '2026-02-01' })], next)
    expect(next).toHaveBeenCalledTimes(1)
    expect(store.search('苹果')).toHaveLength(0)
    expect(store.search('香蕉')).toHaveLength(1)
  })

  it('keeps the index when only the timestamp changed (same content hash)', async () => {
    const { persistence } = memoryPersistence()
    const store = new BodySearchStore('pod', persistence)
    await store.sync([entry('a.md')], async () => '同样的正文')
    const before = store.getSnapshot().indexedChars
    await store.sync([entry('a.md', { modifiedAt: 'later' })], async () => '同样的正文')
    expect(store.getSnapshot().indexedChars).toBe(before)
    expect(store.search('正文')).toHaveLength(1)
  })

  it('drops deleted files and counts unreadable ones as name-only', async () => {
    const { persistence } = memoryPersistence()
    const store = new BodySearchStore('pod', persistence)
    await store.sync([entry('a.md'), entry('b.md')], async () => '内容')
    await store.sync([entry('b.md'), entry('c.md')], async (uri) => {
      if (uri.endsWith('c.md')) throw new Error('403')
      return '内容'
    })
    expect(store.search('内容').map((hit) => hit.title)).toEqual(['b.md'])
    expect(store.getSnapshot().note).toBe('还有 1 个文件的正文没建索引，只按名字找')
  })

  it('reports indexing while files are being read', async () => {
    const { persistence } = memoryPersistence()
    const store = new BodySearchStore('pod', persistence)
    let release: () => void = () => {}
    const gate = new Promise<void>((resolve) => { release = resolve })
    const running = store.sync([entry('a.md'), entry('b.pdf')], async () => { await gate; return '内容' })
    await vi.waitFor(() => expect(store.getSnapshot().indexing).toBe(true))
    expect(store.getSnapshot().note).toBe('文件正文还在建立索引，部分文件只按标题搜索')
    release()
    await running
    expect(store.getSnapshot().indexing).toBe(false)
  })

  it('starts warm from the saved texts and only reads what changed', async () => {
    const { persistence } = memoryPersistence()
    const first = new BodySearchStore('pod', persistence)
    await first.sync([entry('a.md'), entry('b.md')], async () => '预算表')
    const second = new BodySearchStore('pod', persistence)
    const readText = vi.fn(async () => '新的预算')
    await second.sync([entry('a.md'), entry('b.md', { modifiedAt: 'new' })], readText)
    expect(readText).toHaveBeenCalledTimes(1)
    expect(second.search('预算')).toHaveLength(2)
  })
})
