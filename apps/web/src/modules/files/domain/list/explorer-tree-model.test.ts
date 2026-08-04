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
