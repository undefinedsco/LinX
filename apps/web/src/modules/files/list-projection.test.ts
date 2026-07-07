import { describe, expect, it } from 'vitest'
import {
  getRecentFiles,
  getVisibleMimeTypeOptions,
  getVisibleTagOptions,
  projectFilesListBaseEntries,
  projectVisibleFiles,
} from './list-projection'
import type { FilesEntry } from './browser'

function entry(overrides: Partial<FilesEntry>): FilesEntry {
  return {
    id: overrides.uri ?? 'https://pod.example/public/file.md',
    uri: overrides.uri ?? 'https://pod.example/public/file.md',
    name: overrides.name ?? 'file.md',
    kind: overrides.kind ?? 'resource',
    semanticKind: overrides.semanticKind ?? 'file',
    parentUri: 'https://pod.example/public/',
    mimeType: overrides.mimeType ?? 'text/markdown',
    size: overrides.size ?? 1024,
    modifiedAt: overrides.modifiedAt ?? '2026-03-01T10:00:00Z',
    ...overrides,
  }
}

const entries: FilesEntry[] = [
  entry({
    uri: 'https://pod.example/public/',
    name: 'public',
    kind: 'container',
    semanticKind: 'container',
    mimeType: 'inode/container',
    size: null,
    modifiedAt: null,
  }),
  entry({
    uri: 'https://pod.example/public/README.md',
    name: 'README.md',
    mimeType: 'text/markdown',
    size: 1024,
    modifiedAt: '2026-03-01T10:00:00Z',
  }),
  entry({
    uri: 'https://pod.example/public/config.json',
    name: 'config.json',
    mimeType: 'application/json',
    size: 512,
    modifiedAt: '2026-03-01T09:00:00Z',
  }),
  entry({
    uri: 'https://pod.example/public/README.md.meta',
    name: 'README.md.meta',
    semanticKind: 'meta-sidecar',
    mimeType: 'text/turtle',
    size: 128,
    modifiedAt: '2026-03-01T10:01:00Z',
  }),
]

describe('list projection helpers', () => {
  it('hides sidecars and applies default modified desc sorting', () => {
    expect(projectVisibleFiles(entries, {
      mimeTypeFilter: null,
      tagFilter: null,
      searchText: '',
      sortField: 'modifiedAt',
      sortDirection: 'desc',
    }).map((file) => file.name)).toEqual(['README.md', 'config.json', 'public'])
  })

  it('combines mime type filtering with search text', () => {
    expect(projectVisibleFiles(entries, {
      mimeTypeFilter: 'application/json',
      tagFilter: null,
      searchText: 'config',
      sortField: 'name',
      sortDirection: 'asc',
    }).map((file) => file.name)).toEqual(['config.json'])

    expect(projectVisibleFiles(entries, {
      mimeTypeFilter: 'application/json',
      tagFilter: null,
      searchText: 'README',
      sortField: 'name',
      sortDirection: 'asc',
    })).toEqual([])
  })

  it('matches search text against uri, parent path, mime type, and semantic kind', () => {
    expect(projectVisibleFiles(entries, {
      mimeTypeFilter: null,
      tagFilter: null,
      searchText: 'public/config',
      sortField: 'name',
      sortDirection: 'asc',
    }).map((file) => file.name)).toEqual(['config.json'])

    expect(projectVisibleFiles(entries, {
      mimeTypeFilter: null,
      tagFilter: null,
      searchText: 'https://pod.example/public/',
      sortField: 'name',
      sortDirection: 'asc',
    }).map((file) => file.name)).toEqual(['config.json', 'public', 'README.md'])

    expect(projectVisibleFiles(entries, {
      mimeTypeFilter: null,
      tagFilter: null,
      searchText: 'application/json',
      sortField: 'name',
      sortDirection: 'asc',
    }).map((file) => file.name)).toEqual(['config.json'])

    expect(projectVisibleFiles(entries, {
      mimeTypeFilter: null,
      tagFilter: null,
      searchText: 'container',
      sortField: 'name',
      sortDirection: 'asc',
    }).map((file) => file.name)).toEqual(['public'])
  })

  it('sorts visible files by size and name without mutating the source', () => {
    const source = [...entries]

    expect(projectVisibleFiles(source, {
      mimeTypeFilter: null,
      tagFilter: null,
      searchText: '',
      sortField: 'size',
      sortDirection: 'asc',
    }).map((file) => file.name)).toEqual(['public', 'config.json', 'README.md'])
    expect(source.map((file) => file.name)).toEqual(entries.map((file) => file.name))
  })

  it('builds type filter options from non-sidecar entries only', () => {
    expect(getVisibleMimeTypeOptions(entries)).toEqual([
      'application/json',
      'inode/container',
      'text/markdown',
    ])
  })

  it('filters by resource tags without treating source labels as tags', () => {
    const taggedEntries = [
      entry({
        uri: 'https://pod.example/public/README.md',
        name: 'README.md',
        sourceLabel: '当前话题',
        tags: ['docs', 'focus'],
      }),
      entry({
        uri: 'https://pod.example/public/config.json',
        name: 'config.json',
        mimeType: 'application/json',
        sourceLabel: 'Pod 根目录',
        tags: ['config'],
      }),
      entry({
        uri: 'https://pod.example/public/README.md.meta',
        name: 'README.md.meta',
        semanticKind: 'meta-sidecar',
        mimeType: 'text/turtle',
        sourceLabel: '当前话题',
        tags: ['docs'],
      }),
      entry({
        uri: 'https://pod.example/public/chat-report.md',
        name: 'chat-report.md',
        sourceLabel: '聊天引用',
      }),
      entry({
        uri: 'https://pod.example/public/runtime-summary.md',
        name: 'runtime-summary.md',
        sourceLabel: '运行产物',
      }),
    ]

    expect(getVisibleTagOptions(taggedEntries)).toEqual(['config', 'docs', 'focus'])
    expect(getVisibleTagOptions(taggedEntries)).not.toEqual(expect.arrayContaining(['chat', 'runtime', '当前话题', 'Pod 根目录']))
    expect(projectVisibleFiles(taggedEntries, {
      mimeTypeFilter: null,
      tagFilter: 'docs',
      searchText: '',
      sortField: 'name',
      sortDirection: 'asc',
    }).map((file) => file.name)).toEqual(['README.md'])
    expect(projectVisibleFiles(taggedEntries, {
      mimeTypeFilter: null,
      tagFilter: null,
      searchText: 'focus',
      sortField: 'name',
      sortDirection: 'asc',
    }).map((file) => file.name)).toEqual(['README.md'])
    expect(projectVisibleFiles(taggedEntries, {
      mimeTypeFilter: null,
      tagFilter: null,
      searchText: '当前话题',
      sortField: 'name',
      sortDirection: 'asc',
    })).toEqual([])
  })

  it('projects recent entries from modified resources and containers without sidecars', () => {
    const recentEntries = [
      entry({
        uri: 'https://pod.example/public/',
        name: 'public',
        kind: 'container',
        semanticKind: 'container',
        modifiedAt: '2026-03-04T10:00:00Z',
      }),
      entry({
        uri: 'https://pod.example/public/a.md',
        name: 'a.md',
        modifiedAt: '2026-03-01T10:00:00Z',
      }),
      entry({
        uri: 'https://pod.example/public/b.md',
        name: 'b.md',
        modifiedAt: '2026-03-03T10:00:00Z',
      }),
      entry({
        uri: 'https://pod.example/public/c.md',
        name: 'c.md',
        modifiedAt: '2026-03-02T10:00:00Z',
      }),
      entry({
        uri: 'https://pod.example/public/b.md.meta',
        name: 'b.md.meta',
        semanticKind: 'meta-sidecar',
        modifiedAt: '2026-03-05T10:00:00Z',
      }),
      entry({
        uri: 'https://pod.example/public/no-date.md',
        name: 'no-date.md',
        modifiedAt: null,
      }),
    ]

    expect(getRecentFiles(recentEntries, 3).map((file) => file.name)).toEqual(['public', 'b.md', 'c.md'])
    expect(projectFilesListBaseEntries(recentEntries, { kind: 'recent' }).map((file) => file.name))
      .toEqual(['public', 'b.md', 'c.md', 'a.md'])
    expect(projectFilesListBaseEntries(recentEntries, { kind: 'container' }).map((file) => file.name))
      .toEqual(['public', 'a.md', 'b.md', 'c.md', 'no-date.md'])
  })
})
