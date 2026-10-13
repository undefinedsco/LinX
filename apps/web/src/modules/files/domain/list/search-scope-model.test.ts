import { describe, expect, it } from 'vitest'
import type { FilesEntry } from '../resource/resource-model'
import {
  entryInFilesSearchScope,
  projectFilesSearchEmptyText,
  projectFilesSearchMatchReason,
  projectFilesSearchNote,
  projectFilesSearchScopeLabel,
} from './search-scope-model'

function entry(overrides: Partial<FilesEntry>): FilesEntry {
  return {
    id: 'a', uri: 'https://pod.example/活动/志愿者排班表.xlsx', name: '志愿者排班表.xlsx', kind: 'resource',
    semanticKind: 'file', parentUri: 'https://pod.example/活动/', mimeType: 'application/vnd.ms-excel',
    size: 1, modifiedAt: null, ...overrides,
  }
}

describe('files search scope model', () => {
  it('says why a result matched', () => {
    expect(projectFilesSearchMatchReason(entry({}), '排班')).toBe('标题匹配')
    expect(projectFilesSearchMatchReason(entry({ name: 'x', tags: ['志愿者'] }), '志愿')).toBe('标签匹配')
    expect(projectFilesSearchMatchReason(entry({ name: 'x', uri: 'https://pod.example/活动/x', parentUri: 'https://pod.example/活动/' }), '活动')).toBe('路径匹配')
    expect(projectFilesSearchMatchReason(entry({}), 'zzz')).toBeNull()
  })

  it('limits results to the chosen scope', () => {
    const table = entry({ semanticKind: 'structured-data', mimeType: 'text/turtle' })
    expect(entryInFilesSearchScope(entry({}), 'cards', null)).toBe(false)
    expect(entryInFilesSearchScope(table, 'cards', null)).toBe(true)
    expect(entryInFilesSearchScope(table, 'folder', 'https://pod.example/活动/')).toBe(true)
    expect(entryInFilesSearchScope(table, 'folder', 'https://pod.example/其他/')).toBe(false)
  })

  it('words partial coverage and empty results plainly', () => {
    expect(projectFilesSearchNote({ offline: false }).text).toContain('只按标题搜索')
    expect(projectFilesSearchNote({ offline: true }).text).toContain('没有网络')
    expect(projectFilesSearchEmptyText('我的空间', ' 轮岗表 ')).toEqual({ title: '“我的空间”里没有找到 轮岗表', description: '不代表别处没有' })
    expect(projectFilesSearchScopeLabel('folder', '志愿者')).toBe('当前文件夹：志愿者')
  })
})
