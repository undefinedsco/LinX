import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { FilesEntry } from './domain/resource/resource-model'
import {
  createFolderDetailViewState,
  projectFolderChildKeyboardNavigationPlan,
  projectFolderDetailSortKey,
  projectFolderDetailViewMode,
} from './domain/folder/folder-detail-model'

const folderModelPath = 'src/modules/files/domain/folder/folder-detail-model.ts'
const rootFolderModelShimPath = 'src/modules/files/folder-detail-model.ts'
const detailPanePath = 'src/modules/files/components/FileDetailPane.tsx'

const markdownEntry: FilesEntry = {
  id: 'readme',
  uri: 'https://pod.example/files/readme.md',
  name: 'readme.md',
  kind: 'resource',
  semanticKind: 'file',
  parentUri: 'https://pod.example/files/',
  mimeType: 'text/markdown',
  size: 10,
  modifiedAt: '2026-06-01T00:00:00.000Z',
}

const sidecarEntry: FilesEntry = {
  ...markdownEntry,
  id: 'readme-meta',
  uri: 'https://pod.example/files/readme.md.meta',
  name: 'readme.md.meta',
}

const folderEntry: FilesEntry = {
  id: 'folder',
  uri: 'https://pod.example/files/a-folder/',
  name: 'a-folder',
  kind: 'container',
  semanticKind: 'container',
  parentUri: 'https://pod.example/files/',
  mimeType: null,
  size: null,
  modifiedAt: '2026-06-02T00:00:00.000Z',
}

const folderDetail = {
  ...folderEntry,
  uri: 'https://pod.example/files/',
  parentUri: 'https://pod.example/',
  headers: {},
  previewText: null,
  childEntries: [],
}

describe('folder detail model helpers', () => {
  it('projects folder detail view mode and sort as one state container', () => {
    const initial = createFolderDetailViewState()

    expect(initial).toEqual({
      viewMode: 'list',
      sort: { key: 'name', direction: 'asc' },
    })

    const gridView = projectFolderDetailViewMode({
      current: initial,
      viewMode: 'icons',
    })
    expect(gridView).toEqual({
      viewMode: 'icons',
      sort: { key: 'name', direction: 'asc' },
    })

    expect(projectFolderDetailSortKey({
      current: gridView,
      key: 'name',
    })).toEqual({
      viewMode: 'icons',
      sort: { key: 'name', direction: 'desc' },
    })

    expect(projectFolderDetailSortKey({
      current: gridView,
      key: 'modified',
    })).toEqual({
      viewMode: 'icons',
      sort: { key: 'modified', direction: 'asc' },
    })
  })

  it('plans folder child selection state transitions for single, range, toggle, and context-menu selection', async () => {
    const model = await import('./domain/folder/folder-detail-model')
    const projectFolderChildSelectionState = (
      model as typeof model & {
        projectFolderChildSelectionState?: (input: {
          childUri: string
          modifiers?: { shiftKey?: boolean; metaKey?: boolean; ctrlKey?: boolean }
          selectedChildUri: string | null
          selectedChildUris: Set<string>
          selectionAnchorUri: string | null
          sortedChildren: FilesEntry[]
        }) => {
          nextSelectedChildUri: string | null
          nextSelectedChildUris: Set<string>
          nextSelectionAnchorUri: string | null
          changed: boolean
        }
      }
    ).projectFolderChildSelectionState
    const projectFolderChildContextMenuSelectionState = (
      model as typeof model & {
        projectFolderChildContextMenuSelectionState?: (input: {
          childUri: string
          selectedChildUri: string | null
          selectedChildUris: Set<string>
          selectionAnchorUri: string | null
        }) => {
          nextSelectedChildUri: string | null
          nextSelectedChildUris: Set<string>
          nextSelectionAnchorUri: string | null
          changed: boolean
        }
      }
    ).projectFolderChildContextMenuSelectionState
    const createFolderChildSelectionState = (
      model as typeof model & {
        createFolderChildSelectionState?: () => {
          selectedChildUri: string | null
          selectedChildUris: Set<string>
          selectionAnchorUri: string | null
        }
      }
    ).createFolderChildSelectionState
    const projectFolderChildSelectionStateFromPlan = (
      model as typeof model & {
        projectFolderChildSelectionStateFromPlan?: (plan: {
          nextSelectedChildUri: string | null
          nextSelectedChildUris: Set<string>
          nextSelectionAnchorUri: string | null
          changed: boolean
        }) => {
          selectedChildUri: string | null
          selectedChildUris: Set<string>
          selectionAnchorUri: string | null
        }
      }
    ).projectFolderChildSelectionStateFromPlan
    const projectFolderChildSelectedChildUriPatch = (
      model as typeof model & {
        projectFolderChildSelectedChildUriPatch?: (input: {
          current: {
            selectedChildUri: string | null
            selectedChildUris: Set<string>
            selectionAnchorUri: string | null
          }
          selectedChildUri: string | null
        }) => {
          selectedChildUri: string | null
          selectedChildUris: Set<string>
          selectionAnchorUri: string | null
        }
      }
    ).projectFolderChildSelectedChildUriPatch

    expect(projectFolderChildSelectionState).toBeTypeOf('function')
    expect(projectFolderChildContextMenuSelectionState).toBeTypeOf('function')
    expect(createFolderChildSelectionState).toBeTypeOf('function')
    expect(projectFolderChildSelectionStateFromPlan).toBeTypeOf('function')
    expect(projectFolderChildSelectedChildUriPatch).toBeTypeOf('function')
    if (
      !projectFolderChildSelectionState
      || !projectFolderChildContextMenuSelectionState
      || !createFolderChildSelectionState
      || !projectFolderChildSelectionStateFromPlan
      || !projectFolderChildSelectedChildUriPatch
    ) return

    const initialState = createFolderChildSelectionState()
    expect(initialState).toEqual({
      selectedChildUri: null,
      selectedChildUris: new Set(),
      selectionAnchorUri: null,
    })

    const singleSelectionPlan = projectFolderChildSelectionState({
      childUri: markdownEntry.uri,
      modifiers: {},
      selectedChildUri: folderEntry.uri,
      selectedChildUris: new Set([folderEntry.uri]),
      selectionAnchorUri: folderEntry.uri,
      sortedChildren: [folderEntry, markdownEntry],
    })
    expect(singleSelectionPlan).toMatchObject({
      nextSelectedChildUri: markdownEntry.uri,
      nextSelectedChildUris: new Set([markdownEntry.uri]),
      nextSelectionAnchorUri: markdownEntry.uri,
      changed: true,
    })
    expect(projectFolderChildSelectionStateFromPlan(singleSelectionPlan)).toEqual({
      selectedChildUri: markdownEntry.uri,
      selectedChildUris: new Set([markdownEntry.uri]),
      selectionAnchorUri: markdownEntry.uri,
    })
    expect(projectFolderChildSelectedChildUriPatch({
      current: initialState,
      selectedChildUri: markdownEntry.uri,
    })).toEqual({
      selectedChildUri: markdownEntry.uri,
      selectedChildUris: new Set(),
      selectionAnchorUri: null,
    })

    expect(projectFolderChildSelectionState({
      childUri: markdownEntry.uri,
      modifiers: { shiftKey: true },
      selectedChildUri: folderEntry.uri,
      selectedChildUris: new Set([sidecarEntry.uri]),
      selectionAnchorUri: folderEntry.uri,
      sortedChildren: [folderEntry, markdownEntry],
    })).toMatchObject({
      nextSelectedChildUri: markdownEntry.uri,
      nextSelectedChildUris: new Set([folderEntry.uri, markdownEntry.uri]),
      nextSelectionAnchorUri: folderEntry.uri,
      changed: true,
    })

    expect(projectFolderChildSelectionState({
      childUri: markdownEntry.uri,
      modifiers: { metaKey: true },
      selectedChildUri: folderEntry.uri,
      selectedChildUris: new Set([markdownEntry.uri]),
      selectionAnchorUri: folderEntry.uri,
      sortedChildren: [folderEntry, markdownEntry],
    })).toMatchObject({
      nextSelectedChildUri: markdownEntry.uri,
      nextSelectedChildUris: new Set(),
      nextSelectionAnchorUri: markdownEntry.uri,
      changed: true,
    })

    const existingSelection = new Set([folderEntry.uri, markdownEntry.uri])
    expect(projectFolderChildContextMenuSelectionState({
      childUri: markdownEntry.uri,
      selectedChildUri: folderEntry.uri,
      selectedChildUris: existingSelection,
      selectionAnchorUri: folderEntry.uri,
    })).toMatchObject({
      nextSelectedChildUri: markdownEntry.uri,
      nextSelectedChildUris: existingSelection,
      nextSelectionAnchorUri: folderEntry.uri,
      changed: true,
    })

    expect(projectFolderChildContextMenuSelectionState({
      childUri: sidecarEntry.uri,
      selectedChildUri: folderEntry.uri,
      selectedChildUris: existingSelection,
      selectionAnchorUri: folderEntry.uri,
    })).toMatchObject({
      nextSelectedChildUri: sidecarEntry.uri,
      nextSelectedChildUris: new Set([sidecarEntry.uri]),
      nextSelectionAnchorUri: sidecarEntry.uri,
      changed: true,
    })
  })

  it('projects folder child keyboard navigation targets from sorted rows', () => {
    const sortedChildren = [folderEntry, markdownEntry, sidecarEntry]

    expect(projectFolderChildKeyboardNavigationPlan({
      currentChildUri: markdownEntry.uri,
      key: 'ArrowUp',
      sortedChildren,
    })).toEqual({
      handled: true,
      nextChild: folderEntry,
      nextIndex: 0,
    })
    expect(projectFolderChildKeyboardNavigationPlan({
      currentChildUri: markdownEntry.uri,
      key: 'ArrowDown',
      sortedChildren,
    })).toEqual({
      handled: true,
      nextChild: sidecarEntry,
      nextIndex: 2,
    })
    expect(projectFolderChildKeyboardNavigationPlan({
      currentChildUri: markdownEntry.uri,
      key: 'Home',
      sortedChildren,
    })).toEqual({
      handled: true,
      nextChild: folderEntry,
      nextIndex: 0,
    })
    expect(projectFolderChildKeyboardNavigationPlan({
      currentChildUri: markdownEntry.uri,
      key: 'End',
      sortedChildren,
    })).toEqual({
      handled: true,
      nextChild: sidecarEntry,
      nextIndex: 2,
    })
    expect(projectFolderChildKeyboardNavigationPlan({
      currentChildUri: 'missing',
      key: 'ArrowDown',
      sortedChildren,
    })).toEqual({
      handled: true,
      nextChild: null,
      nextIndex: -1,
    })
    expect(projectFolderChildKeyboardNavigationPlan({
      currentChildUri: markdownEntry.uri,
      key: 'Tab',
      sortedChildren,
    })).toEqual({
      handled: false,
      nextChild: null,
      nextIndex: -1,
    })
  })

  it('keeps folder filtering, sorting, and naming rules outside FileDetailPane', async () => {
    expect(existsSync(folderModelPath)).toBe(true)
    expect(existsSync(rootFolderModelShimPath)).toBe(true)
    if (!existsSync(folderModelPath) || !existsSync(rootFolderModelShimPath)) return

    const model = await import('./domain/folder/folder-detail-model')
    const rootShimSource = readFileSync(rootFolderModelShimPath, 'utf8')
    const modelSource = readFileSync(folderModelPath, 'utf8')
    const detailPaneSource = readFileSync(detailPanePath, 'utf8')

    expect(model.isFileLevelSidecarEntry(sidecarEntry)).toBe(true)
    expect(model.getVisibleFolderChildren([markdownEntry, sidecarEntry, folderEntry])).toEqual([markdownEntry, folderEntry])
    expect(model.normalizeMarkdownFileName('Meeting Notes')).toBe('Meeting Notes.md')
    expect(model.normalizeMarkdownFileName('Meeting Notes.md')).toBe('Meeting Notes.md')
    expect(model.folderColumnNameFromUri('https://pod.example/files/My%20Folder/')).toBe('My Folder')
    expect(model.sortFolderEntries([markdownEntry, folderEntry], { key: 'name', direction: 'asc' }).map((entry: FilesEntry) => entry.name))
      .toEqual(['a-folder', 'readme.md'])
    expect(model.projectFolderChildCollectionRow(markdownEntry)).toMatchObject({
      entry: markdownEntry,
      iconKind: 'file',
      typeLabel: '文件',
      modifiedLabel: '2026/6/1 08:00:00',
      sizeLabel: '10 B',
    })
    expect(model.projectFolderChildCollectionRow(folderEntry)).toMatchObject({
      entry: folderEntry,
      iconKind: 'folder',
      typeLabel: '目录',
      modifiedLabel: '2026/6/2 08:00:00',
      sizeLabel: '—',
    })
    expect(model.projectFolderColumnRow(markdownEntry)).toMatchObject({
      entry: markdownEntry,
      iconKind: 'file',
      showDescendantIndicator: false,
    })
    expect(model.projectFolderColumnRow(folderEntry)).toMatchObject({
      entry: folderEntry,
      iconKind: 'folder',
      showDescendantIndicator: true,
    })
    expect(model.projectFolderColumnPanelModel({
      entries: [markdownEntry, folderEntry],
      sort: { key: 'name', direction: 'asc' },
    })).toMatchObject({
      actionMenu: {
        items: [
          { kind: 'open', label: '打开', trigger: 'explicit-open' },
          { kind: 'copy-uri', label: '复制 URI' },
          { kind: 'rename', label: '重命名', separatorBefore: true },
          { kind: 'copy', label: '复制到...' },
          { kind: 'move', label: '移动到...' },
          { kind: 'delete', label: '删除', destructive: true, separatorBefore: true },
        ],
      },
      entryCount: 2,
      hasSortedRows: true,
      sortedEntries: [folderEntry, markdownEntry],
      sortedRows: [
        {
          entry: folderEntry,
          iconKind: 'folder',
          showDescendantIndicator: true,
        },
        {
          entry: markdownEntry,
          iconKind: 'file',
          showDescendantIndicator: false,
        },
      ],
    })
    expect(model.projectFolderColumnPanelModel({
      entries: [],
      sort: { key: 'name', direction: 'asc' },
    })).toMatchObject({
      entryCount: 0,
      hasSortedRows: false,
      sortedEntries: [],
      sortedRows: [],
    })
    expect(model.projectFolderDetailViewModel({
      children: [markdownEntry, sidecarEntry, folderEntry],
      sort: { key: 'name', direction: 'asc' },
      viewMode: 'list',
    })).toMatchObject({
      childActionMenu: {
        items: [
          { kind: 'open', label: '打开', trigger: 'explicit-open' },
          { kind: 'copy-uri', label: '复制 URI' },
          { kind: 'rename', label: '重命名', separatorBefore: true },
          { kind: 'copy', label: '复制到...' },
          { kind: 'move', label: '移动到...' },
          { kind: 'delete', label: '删除', destructive: true, separatorBefore: true },
        ],
      },
      collectionChrome: {
        ariaLabel: 'Folder list view',
        sortHeaders: [
          { key: 'name', label: '名称', ariaLabel: '按名称排序', align: 'left' },
          { key: 'type', label: '类型', ariaLabel: '按类型排序', align: 'left' },
          { key: 'modified', label: '修改', ariaLabel: '按修改排序', align: 'left' },
          { key: 'size', label: '大小', ariaLabel: '按大小排序', align: 'right' },
        ],
      },
      contentState: { kind: 'collection', viewMode: 'list' },
      hasVisibleChildren: true,
      sortedChildren: [folderEntry, markdownEntry],
      toolbarChrome: {
        createFolderLabel: '新建文件夹',
        createMarkdownLabel: '新建 Markdown 文件',
        uploadInputLabel: '选择上传文件',
        uploadLabel: '上传文件',
      },
      viewModeOptions: [
        { mode: 'list', label: '列表', iconKind: 'list', active: true },
        { mode: 'icons', label: '网格', iconKind: 'icons', active: false },
      ],
      visibleChildCount: 2,
      visibleChildren: [markdownEntry, folderEntry],
    })
    expect(model.projectFolderDetailViewModel({
      children: [markdownEntry],
      sort: { key: 'name', direction: 'asc' },
      viewMode: 'icons',
    })).toMatchObject({
      collectionChrome: {
        ariaLabel: 'Folder icon view',
        sortHeaders: [
          { key: 'name', label: '名称', ariaLabel: '按名称排序', align: 'left' },
          { key: 'type', label: '类型', ariaLabel: '按类型排序', align: 'left' },
          { key: 'modified', label: '修改', ariaLabel: '按修改排序', align: 'left' },
          { key: 'size', label: '大小', ariaLabel: '按大小排序', align: 'right' },
        ],
      },
      contentState: { kind: 'collection', viewMode: 'icons' },
    })
    expect(model.projectNextFolderSortState({ key: 'name', direction: 'asc' }, 'name'))
      .toEqual({ key: 'name', direction: 'desc' })
    expect(model.projectNextFolderSortState({ key: 'name', direction: 'desc' }, 'modified'))
      .toEqual({ key: 'modified', direction: 'asc' })
    expect(model.projectFolderChildActionMenuChrome()).toEqual({
      items: [
        { kind: 'open', label: '打开', trigger: 'explicit-open' },
        { kind: 'copy-uri', label: '复制 URI' },
        { kind: 'rename', label: '重命名', separatorBefore: true },
        { kind: 'copy', label: '复制到...' },
        { kind: 'move', label: '移动到...' },
        { kind: 'delete', label: '删除', destructive: true, separatorBefore: true },
      ],
    })
    expect(model.projectFolderDetailContentState({
      hasVisibleChildren: false,
      viewMode: 'icons',
    })).toEqual({
      kind: 'empty',
      emptyState: {
        message: '当前容器没有可浏览子项。',
      },
    })
    expect(model.projectFolderDetailContentState({
      hasVisibleChildren: true,
      viewMode: 'columns',
    })).toEqual({ kind: 'collection', viewMode: 'list' })
    expect(model.projectFolderDetailContentState({
      hasVisibleChildren: true,
      viewMode: 'list',
    })).toEqual({ kind: 'collection', viewMode: 'list' })
    expect(model.projectFolderDetailContentState({
      hasVisibleChildren: true,
      viewMode: 'icons',
    })).toEqual({ kind: 'collection', viewMode: 'icons' })
    expect(model.projectFolderDescendantColumnState({
      error: null,
      isLoading: true,
      parentFile: null,
    })).toEqual({ kind: 'loading' })
    expect(model.projectFolderDescendantColumnState({
      error: new Error('HTTP 404'),
      isLoading: false,
      parentFile: null,
    })).toEqual({ kind: 'unavailable' })
    expect(model.projectFolderDescendantColumnState({
      error: null,
      isLoading: false,
      parentFile: null,
    })).toEqual({ kind: 'unavailable' })
    expect(model.projectFolderDescendantColumnState({
      error: null,
      isLoading: false,
      parentFile: folderDetail,
    })).toEqual({ kind: 'ready', parentFile: folderDetail })
    expect(model.projectFolderDescendantColumnModel({
      containerUri: 'https://pod.example/files/',
      error: null,
      isLoading: false,
      parentFile: {
        ...folderDetail,
        childEntries: [markdownEntry, sidecarEntry],
      },
    })).toMatchObject({
      chrome: {
        ariaLabel: 'Folder column a-folder',
        loadingMessage: '正在加载...',
        title: 'a-folder',
        unavailableMessage: '无法读取子文件夹。',
      },
      contentState: {
        kind: 'ready',
      },
      entries: [markdownEntry],
    })
    expect(model.projectFolderDescendantColumnModel({
      containerUri: 'https://pod.example/files/My%20Folder/',
      error: null,
      isLoading: true,
      parentFile: null,
    })).toMatchObject({
      chrome: {
        ariaLabel: 'Folder column My Folder',
        title: 'My Folder',
      },
      contentState: { kind: 'loading' },
      entries: [],
    })
    const selectionPlan = model.projectFolderColumnSelectionState({
      currentContainerPath: ['https://pod.example/files/old/'],
      currentSelectionByContainer: {
        [folderDetail.uri]: markdownEntry.uri,
        'https://pod.example/files/old/': markdownEntry.uri,
      },
      rootContainerUri: folderDetail.uri,
      parentFile: folderDetail,
      siblingEntries: [markdownEntry, folderEntry],
      child: folderEntry,
      columnDepth: 0,
    })
    expect(selectionPlan.nextContainerPath).toEqual([folderEntry.uri])
    expect(selectionPlan.nextSelectionByContainer).toEqual({
      [folderDetail.uri]: folderEntry.uri,
    })
    expect(selectionPlan.nextPreviewTarget).toMatchObject({
      parentFile: folderDetail,
      child: folderEntry,
      siblingEntries: [markdownEntry, folderEntry],
    })

    expect(model.projectFolderDetailColumnModel({
      file: folderDetail,
      visibleChildren: [markdownEntry, folderEntry],
      selectedChild: markdownEntry,
      selectedChildUri: markdownEntry.uri,
      columnSelectionByContainer: { [folderDetail.uri]: folderEntry.uri },
      columnPreviewTarget: selectionPlan.nextPreviewTarget,
    })).toMatchObject({
      columnPreviewParentFile: folderDetail,
      columnPreviewChild: folderEntry,
      columnPreviewSiblings: [markdownEntry, folderEntry],
      columnPreviewChildCount: 2,
      rootColumnSelectedUri: folderEntry.uri,
    })

    expect(model.pruneFolderColumnState({
      columnContainerPath: [folderEntry.uri],
      columnSelectionByContainer: {
        [folderDetail.uri]: folderEntry.uri,
      },
      columnPreviewTarget: selectionPlan.nextPreviewTarget,
      rootContainerUri: folderDetail.uri,
      childUriSet: new Set([markdownEntry.uri]),
    })).toMatchObject({
      nextContainerPath: [],
      nextSelectionByContainer: {},
      nextPreviewTarget: null,
    })

    const createFolderColumnState = (
      model as typeof model & {
        createFolderColumnState?: () => {
          containerPath: string[]
          selectionByContainer: Record<string, string>
          previewTarget: unknown | null
        }
      }
    ).createFolderColumnState
    const projectFolderColumnStateAfterSelection = (
      model as typeof model & {
        projectFolderColumnStateAfterSelection?: (input: {
          current: {
            containerPath: string[]
            selectionByContainer: Record<string, string>
            previewTarget: unknown | null
          }
          rootContainerUri: string
          parentFile: typeof folderDetail
          siblingEntries: FilesEntry[]
          child: FilesEntry
          columnDepth: number
        }) => {
          containerPath: string[]
          selectionByContainer: Record<string, string>
          previewTarget: unknown | null
        }
      }
    ).projectFolderColumnStateAfterSelection
    const projectFolderColumnStateAfterPrune = (
      model as typeof model & {
        projectFolderColumnStateAfterPrune?: (input: {
          current: {
            containerPath: string[]
            selectionByContainer: Record<string, string>
            previewTarget: unknown | null
          }
          rootContainerUri: string
          childUriSet: Set<string>
        }) => {
          containerPath: string[]
          selectionByContainer: Record<string, string>
          previewTarget: unknown | null
        }
      }
    ).projectFolderColumnStateAfterPrune

    expect(createFolderColumnState).toBeTypeOf('function')
    expect(projectFolderColumnStateAfterSelection).toBeTypeOf('function')
    expect(projectFolderColumnStateAfterPrune).toBeTypeOf('function')
    if (!createFolderColumnState || !projectFolderColumnStateAfterSelection || !projectFolderColumnStateAfterPrune) return

    const emptyColumnState = createFolderColumnState()
    expect(emptyColumnState).toEqual({
      containerPath: [],
      selectionByContainer: {},
      previewTarget: null,
    })

    const selectedColumnState = projectFolderColumnStateAfterSelection({
      current: emptyColumnState,
      rootContainerUri: folderDetail.uri,
      parentFile: folderDetail,
      siblingEntries: [markdownEntry, folderEntry],
      child: folderEntry,
      columnDepth: 0,
    })

    expect(selectedColumnState).toMatchObject({
      containerPath: [folderEntry.uri],
      selectionByContainer: {
        [folderDetail.uri]: folderEntry.uri,
      },
      previewTarget: {
        parentFile: folderDetail,
        child: folderEntry,
        siblingEntries: [markdownEntry, folderEntry],
      },
    })
    expect(projectFolderColumnStateAfterPrune({
      current: selectedColumnState,
      rootContainerUri: folderDetail.uri,
      childUriSet: new Set([markdownEntry.uri]),
    })).toEqual({
      containerPath: [],
      selectionByContainer: {},
      previewTarget: null,
    })

    expect(model.projectFolderChildSelectionProjection({
      visibleChildren: [markdownEntry, folderEntry],
      sortedChildren: [folderEntry, markdownEntry],
      selectedChildUri: markdownEntry.uri,
      selectedChildUris: new Set([markdownEntry.uri, folderEntry.uri, sidecarEntry.uri]),
    })).toMatchObject({
      childUriSet: new Set([markdownEntry.uri, folderEntry.uri]),
      selectedChild: markdownEntry,
      selectedChildren: [folderEntry, markdownEntry],
      selectedChildCount: 2,
      hasBatchSelection: true,
      batchSelectionLabel: '已选择 2 项',
      batchSelectionActions: {
        copyLabel: '复制所选 URI',
        deleteLabel: '删除所选项',
      },
    })

    expect(model.projectFolderChildRangeSelectionUris({
      sortedChildren: [folderEntry, markdownEntry],
      anchorUri: folderEntry.uri,
      childUri: markdownEntry.uri,
    })).toEqual([folderEntry.uri, markdownEntry.uri])
    expect(model.projectFolderChildRangeSelectionUris({
      sortedChildren: [folderEntry, markdownEntry],
      anchorUri: sidecarEntry.uri,
      childUri: markdownEntry.uri,
    })).toBeNull()

    expect([...model.toggleFolderChildSelectionUri(new Set([markdownEntry.uri]), markdownEntry.uri)])
      .toEqual([])
    expect([...model.toggleFolderChildSelectionUri(new Set([markdownEntry.uri]), folderEntry.uri)])
      .toEqual([markdownEntry.uri, folderEntry.uri])

    expect(model.pruneFolderChildSelectionState({
      childUriSet: new Set([folderEntry.uri]),
      selectedChildUri: markdownEntry.uri,
      selectedChildUris: new Set([markdownEntry.uri, folderEntry.uri]),
      selectionAnchorUri: markdownEntry.uri,
    })).toMatchObject({
      nextSelectedChildUri: null,
      nextSelectedChildUris: new Set([folderEntry.uri]),
      nextSelectionAnchorUri: null,
      changed: true,
    })

    expect(model.removeFolderChildSelectionUris({
      removedUris: new Set([folderEntry.uri]),
      selectedChildUri: folderEntry.uri,
      selectedChildUris: new Set([markdownEntry.uri, folderEntry.uri]),
      selectionAnchorUri: folderEntry.uri,
    })).toMatchObject({
      nextSelectedChildUri: null,
      nextSelectedChildUris: new Set([markdownEntry.uri]),
      nextSelectionAnchorUri: null,
    })

    expect(rootShimSource).toMatch(/^export \* from '.\/domain\/folder\/folder-detail-model'\n?$/)
    expect(modelSource).not.toContain("from './browser'")
    expect(modelSource).not.toContain("from '../browser'")
    expect(modelSource).not.toContain("from 'react'")
    expect(detailPaneSource).not.toMatch(/\nfunction isFileLevelSidecarEntry\(/)
    expect(detailPaneSource).not.toMatch(/\nfunction sortFolderEntries\(/)
    expect(detailPaneSource).not.toMatch(/\nfunction folderColumnNameFromUri\(/)
  })
})
