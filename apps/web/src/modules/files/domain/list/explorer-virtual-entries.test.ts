import { describe, expect, it } from 'vitest'
import type { FilesEntry } from '../resource/resource-model'
import { projectFilesExplorerRows } from './explorer-tree-model'
import {
  isExplorerSystemDataFolder,
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
    expect(rows.map((row) => (row.kind === 'entry' ? row.label : row.label))).toEqual(['我的空间', 'docs', 'people', '共享给我'])
  })

  it('shows the assistant name for assistant folders in folder views only', () => {
    const folder = entry({ uri: `${HOME}`, name: 'secretary', kind: 'container', semanticKind: 'container' })
    expect(projectEntryDisplayName(folder, { secretary: 'LinX 助手' })).toBe('LinX 助手')
    expect(projectEntryDisplayName(folder)).toBe('secretary')
    expect(projectEntryDisplayName({ ...folder, kind: 'resource' }, { secretary: 'LinX 助手' })).toBe('secretary')
  })

  it('shows .data as 数据 and hides its bookkeeping folders, keeping assistant homes', () => {
    expect(projectExplorerEntryLabel(entry({ uri: 'https://pod.example/.data/', kind: 'container', semanticKind: 'folder' }))).toBe('数据')
    for (const name of ['proposals', 'history', 'views', 'inbox']) {
      expect(isExplorerSystemDataFolder({ kind: 'container', uri: `https://pod.example/.data/${name}/` })).toBe(true)
    }
    expect(isExplorerSystemDataFolder({ kind: 'container', uri: HOME })).toBe(false)
    expect(isExplorerSystemDataFolder({ kind: 'container', uri: 'https://pod.example/.data/agents/' })).toBe(false)
    expect(isExplorerSystemDataFolder({ kind: 'resource', uri: 'https://pod.example/.data/views/board.canvas' })).toBe(false)
  })

  it('hides the extension of documents and tables in tree and folder rows, but not of folders or other files', () => {
    const doc = entry({ uri: 'https://pod.example/notes/%E4%BC%9A%E8%AE%AE%E7%BA%AA%E8%A6%81.md', name: '会议纪要.md' })
    const table = entry({ uri: 'https://pod.example/.data/%E4%BB%BB%E5%8A%A1.ttl', name: '任务.ttl', semanticKind: 'structured-data' })
    const image = entry({ uri: 'https://pod.example/a.png', name: 'a.png' })
    expect(projectExplorerEntryLabel(doc)).toBe('会议纪要')
    expect(projectExplorerEntryLabel(table)).toBe('任务')
    expect(projectEntryDisplayName(doc)).toBe('会议纪要')
    expect(projectEntryDisplayName(image)).toBe('a.png')
  })
})
