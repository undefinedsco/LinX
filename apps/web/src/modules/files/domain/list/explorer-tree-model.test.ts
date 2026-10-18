import { describe, expect, it } from 'vitest'
import type { FilesEntry } from '../resource/resource-model'
import { projectFilesExplorerRows } from './explorer-tree-model'

function entry(overrides: Partial<FilesEntry>): FilesEntry {
  return {
    id: overrides.uri ?? 'https://pod.example/public/report.md',
    uri: overrides.uri ?? 'https://pod.example/public/report.md',
    name: overrides.name ?? 'report.md',
    kind: overrides.kind ?? 'resource',
    semanticKind: overrides.semanticKind ?? 'file',
    parentUri: overrides.parentUri ?? 'https://pod.example/public/',
    mimeType: overrides.mimeType ?? 'text/markdown',
    size: overrides.size ?? 1200,
    modifiedAt: overrides.modifiedAt ?? '2026-06-01T00:00:00.000Z',
    tags: overrides.tags,
    ...overrides,
  }
}

describe('projectFilesExplorerRows', () => {
  it('flattens expanded containers with depth and stable folder-first ordering', () => {
    const rows = projectFilesExplorerRows({
      rootEntries: [
        entry({
          uri: 'https://pod.example/public/readme.md',
          name: 'readme.md',
          parentUri: 'https://pod.example/public/',
        }),
        entry({
          uri: 'https://pod.example/public/docs/',
          name: 'docs',
          kind: 'container',
          semanticKind: 'folder',
          parentUri: 'https://pod.example/public/',
        }),
      ],
      expandedUris: new Set(['https://pod.example/public/docs/']),
      childEntriesByContainerUri: {
        'https://pod.example/public/docs/': [
          entry({
            uri: 'https://pod.example/public/docs/guide.md',
            name: 'guide.md',
            parentUri: 'https://pod.example/public/docs/',
          }),
        ],
      },
      loadingContainerUris: new Set(),
      errorByContainerUri: {},
      searchText: '',
    })

    expect(rows.map((row) => [row.kind, row.entry?.name, row.depth, row.expanded])).toEqual([
      ['entry', 'docs', 0, true],
      ['entry', 'guide.md', 1, false],
      ['entry', 'readme.md', 0, false],
    ])
  })

  it('keeps matching descendants visible with their ancestors during search', () => {
    const rows = projectFilesExplorerRows({
      rootEntries: [
        entry({
          uri: 'https://pod.example/public/docs/',
          name: 'docs',
          kind: 'container',
          semanticKind: 'folder',
          parentUri: 'https://pod.example/public/',
        }),
        entry({
          uri: 'https://pod.example/public/notes.md',
          name: 'notes.md',
          parentUri: 'https://pod.example/public/',
        }),
      ],
      expandedUris: new Set(['https://pod.example/public/docs/']),
      childEntriesByContainerUri: {
        'https://pod.example/public/docs/': [
          entry({
            uri: 'https://pod.example/public/docs/api-reference.md',
            name: 'api-reference.md',
            parentUri: 'https://pod.example/public/docs/',
          }),
        ],
      },
      loadingContainerUris: new Set(),
      errorByContainerUri: {},
      searchText: 'api-reference',
    })

    expect(rows.map((row) => row.entry?.name)).toEqual(['docs', 'api-reference.md'])
  })

  it('projects compact inline loading and error rows under expanded folders', () => {
    const rows = projectFilesExplorerRows({
      rootEntries: [
        entry({
          uri: 'https://pod.example/public/docs/',
          name: 'docs',
          kind: 'container',
          semanticKind: 'folder',
          parentUri: 'https://pod.example/public/',
        }),
      ],
      expandedUris: new Set(['https://pod.example/public/docs/']),
      childEntriesByContainerUri: {},
      loadingContainerUris: new Set(['https://pod.example/public/docs/']),
      errorByContainerUri: {
        'https://pod.example/public/docs/': new Error('HTTP 403'),
      },
      searchText: '',
    })

    expect(rows.map((row) => [row.kind, row.depth, row.containerUri])).toEqual([
      ['entry', 0, undefined],
      ['loading', 1, 'https://pod.example/public/docs/'],
      ['error', 1, 'https://pod.example/public/docs/'],
    ])
  })
})

describe('assistant folder names', () => {
  it('labels /.data/agents/<id>/ folders by the assistant name', () => {
    const home = (id: string) => ({
      id: `https://pod.example/.data/agents/${id}/`,
      uri: `https://pod.example/.data/agents/${id}/`,
      name: id,
      kind: 'container',
      semanticKind: 'container',
      parentUri: 'https://pod.example/.data/agents/',
      mimeType: null,
      size: null,
      modifiedAt: null,
    }) as FilesEntry
    const rows = projectFilesExplorerRows({
      rootEntries: [home('main'), home('other')],
      expandedUris: new Set(),
      childEntriesByContainerUri: {},
      loadingContainerUris: new Set(),
      errorByContainerUri: {},
      searchText: '',
      agentNames: { main: 'LinX 助手' },
    })

    expect(rows.map((row) => row.label)).toEqual(['LinX 助手', 'other'])
  })
})

describe('共享给我 group', () => {
  const base = {
    rootEntries: [],
    expandedUris: new Set<string>(),
    childEntriesByContainerUri: {},
    loadingContainerUris: new Set<string>(),
    errorByContainerUri: {},
    searchText: '',
    groups: true,
  }

  it('says no folders were found rather than claiming nothing is shared', () => {
    const rows = projectFilesExplorerRows({ ...base, sharedWithMe: { items: [], isLoading: false } })
    expect(rows.at(-1)).toMatchObject({ label: '没有找到别人共享给你的文件夹' })
  })

  it('shows a loading line while reading', () => {
    const rows = projectFilesExplorerRows({ ...base, sharedWithMe: { items: [], isLoading: true } })
    expect(rows.at(-1)).toMatchObject({ label: '正在读取…' })
  })

  it('lists shared items under who shared them', () => {
    const rows = projectFilesExplorerRows({
      ...base,
      sharedWithMe: {
        isLoading: false,
        items: [
          { ownerName: '周禾', uri: 'https://zhou.example/docs/', name: '活动', kind: 'folder' },
          { ownerName: '周禾', uri: 'https://zhou.example/a.md', name: 'a.md', kind: 'file' },
        ],
      },
    })
    const labels = rows.map((row) => (row.kind === 'entry' ? `${row.depth}:${row.entry.uri}` : row.label))
    expect(labels.slice(-4)).toEqual(['共享给我', '周禾', '1:https://zhou.example/docs/', '1:https://zhou.example/a.md'])
  })
})
