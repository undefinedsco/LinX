import { describe, expect, it } from 'vitest'
import type { FilesEntry } from '../resource/resource-model'
import { projectFilesExplorerRows } from './explorer-tree-model'
import {
  isGrantsViewUri,
  mergeAgentHomeVirtualEntries,
  parseAgentHomeContainer,
  projectEntryDisplayName,
  projectExplorerEntryLabel,
} from './explorer-virtual-entries'

function entry(overrides: Partial<FilesEntry> & { uri: string }): FilesEntry {
  return {
    id: overrides.uri,
    name: overrides.uri.split('/').filter(Boolean).pop() ?? '',
    kind: 'resource',
    semanticKind: 'file',
    parentUri: 'https://pod.example/',
    mimeType: null,
    size: null,
    modifiedAt: null,
    ...overrides,
  }
}

const HOME = 'https://pod.example/.data/agents/secretary/'

describe('explorer virtual entries', () => {
  it('recognises assistant folders', () => {
    expect(parseAgentHomeContainer(HOME)).toEqual({ agentId: 'secretary', homeUri: HOME })
    expect(parseAgentHomeContainer('https://pod.example/docs/')).toBeNull()
  })

  it('adds 授权 and 记住的 under an assistant folder', () => {
    const merged = mergeAgentHomeVirtualEntries({ [HOME]: [] })
    expect(merged[HOME].map((child) => child.name)).toEqual(['授权', '记住的'])
    expect(isGrantsViewUri(merged[HOME][0].uri)).toBe(true)
    expect(merged[HOME][1].uri).toBe(`${HOME}remembered.ttl`)
  })

  it('names the vocabulary folder and tables in plain words', () => {
    expect(projectExplorerEntryLabel(entry({ uri: 'https://pod.example/.vocab/', kind: 'container', semanticKind: 'container' }))).toBe('词表')
    expect(projectExplorerEntryLabel(entry({ uri: 'https://pod.example/.vocab/terms.ttl', semanticKind: 'vocab-terms' }))).toBe('属性')
    expect(projectExplorerEntryLabel(entry({ uri: 'https://pod.example/.vocab/shapes.ttl', semanticKind: 'vocab-shapes' }))).toBe('类型')
    expect(projectExplorerEntryLabel(entry({ uri: 'https://pod.example/.vocab/namespaces.ttl', semanticKind: 'vocab-namespaces' }))).toBe('命名空间')
  })

  it('keeps only folders and tables in the tree and groups the root', () => {
    const rows = projectFilesExplorerRows({
      rootEntries: [
        entry({ uri: 'https://pod.example/notes.md' }),
        entry({ uri: 'https://pod.example/people.ttl', semanticKind: 'structured-data' }),
        entry({ uri: 'https://pod.example/docs/', kind: 'container', semanticKind: 'container' }),
      ],
      expandedUris: new Set(),
      childEntriesByContainerUri: {},
      loadingContainerUris: new Set(),
      errorByContainerUri: {},
      searchText: '',
      treeOnly: true,
      groups: true,
    })
    expect(rows.map((row) => (row.kind === 'entry' ? row.label : row.label))).toEqual(['我的空间', 'docs', 'people.ttl', '共享给我'])
  })

  it('shows the assistant name for assistant folders in folder views only', () => {
    const folder = entry({ uri: `${HOME}`, name: 'secretary', kind: 'container', semanticKind: 'container' })
    expect(projectEntryDisplayName(folder, { secretary: 'LinX 助手' })).toBe('LinX 助手')
    expect(projectEntryDisplayName(folder)).toBe('secretary')
    expect(projectEntryDisplayName({ ...folder, kind: 'resource' }, { secretary: 'LinX 助手' })).toBe('secretary')
  })
})
