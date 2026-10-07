import { describe, expect, it } from 'vitest'
import {
  popFolderHistory,
  pushFolderHistory,
  projectCurrentFolderPath,
  type FolderHistoryEntry,
} from './folder-history'

describe('folder history', () => {
  const root: FolderHistoryEntry = {
    treeNodeId: 'container:https://pod.example/public/',
    selectedFileId: 'https://pod.example/public/report.md',
    scrollKey: 'public:24',
  }

  it('pushes the current browser location and restores it on back', () => {
    const history = pushFolderHistory([], root)

    expect(popFolderHistory(history)).toEqual({
      history: [],
      target: root,
    })
  })

  it('bounds retained history without duplicating the latest location', () => {
    const history = Array.from({ length: 50 }, (_, index) => ({
      treeNodeId: `container:https://pod.example/${index}/`,
      selectedFileId: null,
      scrollKey: null,
    }))

    const next = pushFolderHistory(history, history[49])
    expect(next).toHaveLength(50)
    expect(next[next.length - 1]).toEqual(history[49])
  })

  it('projects a compact decoded path for the list head', () => {
    expect(projectCurrentFolderPath({
      kind: 'container',
      containerUri: 'https://pod.example/public/Project%20Notes/',
    })).toBe('/public/Project Notes')
    expect(projectCurrentFolderPath({ kind: 'all' })).toBe('全部文件')
  })
})
