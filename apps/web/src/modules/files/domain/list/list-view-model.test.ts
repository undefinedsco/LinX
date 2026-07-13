import { describe, expect, it } from 'vitest'
import {
  isFilesListSidecarEntry,
  projectBrowsableFiles,
  projectFilesListContentState,
  projectFilesListCopyText,
  projectFilesListEmptyStateModel,
  projectFilesListRow,
  projectFilesListScopeHeaderModel,
  projectFilesListScopeControlModel,
  projectFilesListToolbarChromeModel,
  projectFilesListVisibleRows,
  type FilesListEntry,
} from './list-view-model'

function entry(overrides: Partial<FilesListEntry>): FilesListEntry {
  return {
    uri: overrides.uri ?? 'https://pod.example/public/file.md',
    name: overrides.name ?? 'file.md',
    kind: overrides.kind ?? 'resource',
    semanticKind: overrides.semanticKind ?? 'file',
    parentUri: overrides.parentUri ?? 'https://pod.example/public/',
    mimeType: overrides.mimeType ?? 'text/markdown',
    size: overrides.size ?? 2048,
    modifiedAt: overrides.modifiedAt ?? '2026-03-01T10:00:00Z',
    metadataState: overrides.metadataState,
    metadataErrorKind: overrides.metadataErrorKind,
    metadataError: overrides.metadataError,
    tags: overrides.tags,
  }
}

describe('Files list domain view model', () => {
  it('hides sidecars by semantic kind and by filename fallback', () => {
    const visible = entry({ name: 'note.md' })
    const semanticSidecar = entry({
      name: 'note.md.meta',
      semanticKind: 'meta-sidecar',
    })
    const filenameMetaSidecar = entry({
      name: 'legacy.meta',
      semanticKind: 'file',
    })
    const filenameAclSidecar = entry({
      name: '.acl',
      semanticKind: 'file',
    })

    expect(isFilesListSidecarEntry(visible)).toBe(false)
    expect(isFilesListSidecarEntry(semanticSidecar)).toBe(true)
    expect(isFilesListSidecarEntry(filenameMetaSidecar)).toBe(true)
    expect(isFilesListSidecarEntry(filenameAclSidecar)).toBe(true)
    expect(projectBrowsableFiles([visible, semanticSidecar, filenameMetaSidecar, filenameAclSidecar])).toEqual([visible])
  })

  it('projects a resource entry into a data-free list row model', () => {
    const row = projectFilesListRow(entry({
      name: 'report.ttl',
      uri: 'https://pod.example/public/reports/report.ttl',
      parentUri: 'https://pod.example/public/reports/',
      semanticKind: 'structured-data',
      mimeType: 'text/turtle',
      size: 1536,
      modifiedAt: '2026-03-01T10:00:00Z',
      metadataState: 'unavailable',
      metadataErrorKind: 'forbidden',
      metadataError: 'HTTP 403',
    }), {
      showParentPath: true,
    })

    expect(row).toMatchObject({
      iconKind: 'document',
      kind: 'resource',
      name: 'report.ttl',
      semanticLabel: '.data 表',
      mimeTypeLabel: 'text/turtle',
      sizeLabel: '1.5 KB',
      parentPath: '/public/reports/',
      parentUri: 'https://pod.example/public/reports/',
      metadataWarning: {
        label: '无权限读取元数据',
        title: '无权限读取元数据：HTTP 403',
      },
    })
    expect(row.modifiedLabel).not.toBe('—')
  })

  it('projects containers into a folder row icon kind', () => {
    expect(projectFilesListRow(entry({
      kind: 'container',
      name: 'Projects',
      semanticKind: 'container',
    }), {
      showParentPath: false,
    })).toMatchObject({
      iconKind: 'folder',
    })
  })

  it('projects list content state priority outside the renderer', () => {
    expect(projectFilesListContentState({
      hasError: false,
      hasVisibleFiles: false,
      isLoading: true,
    })).toEqual({
      kind: 'loading',
      loadingState: {
        title: '正在读取资源',
        description: '稍等，正在从当前空间读取内容。',
      },
    })

    expect(projectFilesListContentState({
      hasError: true,
      hasVisibleFiles: true,
      isLoading: false,
    })).toEqual({ kind: 'error' })

    expect(projectFilesListContentState({
      hasError: false,
      hasVisibleFiles: false,
      isLoading: false,
    })).toEqual({ kind: 'empty' })

    expect(projectFilesListContentState({
      hasError: false,
      hasVisibleFiles: true,
      isLoading: false,
    })).toEqual({ kind: 'ready' })
  })

  it('projects list scope header chrome outside the renderer', () => {
    expect(projectFilesListScopeHeaderModel({
      selection: { kind: 'recent' },
    })).toEqual({ label: '最近文件' })

    expect(projectFilesListScopeHeaderModel({
      selection: { kind: 'container' },
    })).toBeNull()
  })

  it('projects the browser scope selector from entry and folder scope', () => {
    expect(projectFilesListScopeControlModel({
      entryScope: 'all',
      selection: { kind: 'recent' },
    })).toMatchObject({
      id: 'recent',
      label: '最近文件',
      ariaLabel: '文件范围：最近文件',
    })

    expect(projectFilesListScopeControlModel({
      entryScope: 'chat-files',
      selection: { kind: 'all' },
    })).toMatchObject({
      id: 'chat-files',
      label: '聊天文件',
    })
  })

  it('projects list toolbar chrome outside the renderer', () => {
    expect(projectFilesListToolbarChromeModel()).toEqual({
      toolbarLabel: '资源工具栏',
      searchPlaceholder: '搜索当前范围...',
      clearSearchLabel: '清空搜索',
      mimeTypeFilterLabel: '类型筛选',
      allMimeTypesLabel: '全部类型',
      tagFilterLabel: '标签筛选',
      allTagsLabel: '全部标签',
    })
  })

  it('projects visible rows, copy payload, and empty state chrome outside the controller', () => {
    const report = entry({
      name: 'report.md',
      uri: 'https://pod.example/public/report.md',
      parentUri: 'https://pod.example/public/',
      size: 1200,
    })
    const deck = entry({
      name: 'deck.pdf',
      uri: 'https://pod.example/public/deck.pdf',
      parentUri: 'https://pod.example/public/docs/',
      mimeType: 'application/pdf',
      size: 2400,
    })

    expect(projectFilesListVisibleRows([report, deck], { showParentPath: true })).toMatchObject([
      {
        file: report,
        row: {
          name: 'report.md',
          parentPath: '/public/',
          sizeLabel: '1.2 KB',
        },
      },
      {
        file: deck,
        row: {
          name: 'deck.pdf',
          parentPath: '/public/docs/',
          sizeLabel: '2.3 KB',
        },
      },
    ])
    expect(projectFilesListCopyText([report, deck])).toBe([
      'https://pod.example/public/report.md',
      'https://pod.example/public/deck.pdf',
    ].join('\n'))

    expect(projectFilesListEmptyStateModel({
      entryScope: 'all',
      mimeTypeFilter: null,
      searchText: '',
      selection: { kind: 'local-workspace', localPath: '/Users/ganlu/project' },
      tagFilter: null,
    })).toEqual({
      title: '当前话题绑定的是本地目录',
      description: '/Users/ganlu/project 暂时不能在 Web 端直接浏览；请在桌面端打开，或先把产物同步到你的空间。',
      iconKind: 'drive',
    })
    expect(projectFilesListEmptyStateModel({
      entryScope: 'all',
      mimeTypeFilter: 'text/turtle',
      searchText: '',
      selection: { kind: 'all' },
      tagFilter: null,
    })).toEqual({
      title: '没有匹配的资源',
      description: '换个关键词，或者切到其它容器继续浏览。',
      iconKind: 'folder',
    })
    expect(projectFilesListEmptyStateModel({
      entryScope: 'all',
      mimeTypeFilter: null,
      searchText: '',
      selection: { kind: 'recent' },
      tagFilter: null,
    })).toEqual({
      title: '还没有最近文件',
      description: '打开或修改过的 Pod resource 会出现在这里。',
      iconKind: 'file',
    })
    expect(projectFilesListEmptyStateModel({
      entryScope: 'chat-files',
      mimeTypeFilter: null,
      searchText: '',
      selection: { kind: 'all' },
      tagFilter: null,
    })).toEqual({
      title: '当前聊天没有关联文件',
      description: '聊天中引用的文件和当前话题 workspace 里的生成文件会显示在这里。',
      iconKind: 'file',
    })
    expect(projectFilesListEmptyStateModel({
      entryScope: 'all',
      mimeTypeFilter: null,
      searchText: '',
      selection: { kind: 'container' },
      tagFilter: null,
    })).toEqual({
      title: '当前容器为空',
      description: '这个范围里还没有可浏览的资源。',
      iconKind: 'folder',
    })
  })
})
