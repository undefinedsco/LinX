import type { FilesDetail, FilesEntry } from '../resource/resource-model'
import type { FolderChildOpenTrigger } from './folder-child-open'
import { formatBytes, formatDateTime } from '../detail/detail-metadata'
import { getFilesEntrySemanticLabel } from '../resource/resource-semantics'

export type FolderSortState = {
  key: 'name' | 'type' | 'modified' | 'size'
  direction: 'asc' | 'desc'
}

export type FolderSortHeaderChrome = {
  key: FolderSortState['key']
  label: string
  ariaLabel: string
  align: 'left' | 'right'
}

export type FolderDetailViewState = {
  sort: FolderSortState
  viewMode: FolderDetailViewMode
}

export type FolderChildCollectionRow = {
  entry: FilesEntry
  iconKind: 'file' | 'folder'
  typeLabel: string
  modifiedLabel: string
  sizeLabel: string
}

export type FolderChildActionKind = 'open' | 'copy-uri' | 'rename' | 'copy' | 'move' | 'delete'

export type FolderChildActionMenuItem = {
  kind: FolderChildActionKind
  label: string
  trigger?: FolderChildOpenTrigger
  destructive?: boolean
  separatorBefore?: boolean
}

export type FolderChildActionMenuChrome = {
  items: FolderChildActionMenuItem[]
}

export type FolderColumnRow = {
  entry: FilesEntry
  iconKind: 'file' | 'folder'
  showDescendantIndicator: boolean
}

export type FolderColumnPanelModel = {
  actionMenu: FolderChildActionMenuChrome
  entryCount: number
  sortedEntries: FilesEntry[]
  sortedRows: FolderColumnRow[]
  hasSortedRows: boolean
}

export type FolderDetailCollectionViewMode = 'list' | 'icons'
export type FolderDetailViewMode = FolderDetailCollectionViewMode | 'columns'
export type FolderDetailViewModeIconKind = 'list' | 'columns' | 'icons'

export type FolderChildCollectionChrome = {
  ariaLabel: string
  sortHeaders: FolderSortHeaderChrome[]
}

export type FolderDetailViewModeOption = {
  mode: FolderDetailViewMode
  label: string
  iconKind: FolderDetailViewModeIconKind
  active: boolean
}

export type FolderDetailToolbarChrome = {
  createFolderLabel: string
  createMarkdownLabel: string
  uploadInputLabel: string
  uploadLabel: string
}

export type FolderDetailEmptyStateChrome = {
  message: string
}

export type FolderDetailContentState =
  | { kind: 'empty'; emptyState: FolderDetailEmptyStateChrome }
  | { kind: 'columns' }
  | { kind: 'collection'; viewMode: FolderDetailCollectionViewMode }

export type FolderDescendantColumnState =
  | { kind: 'loading' }
  | { kind: 'unavailable' }
  | { kind: 'ready'; parentFile: FilesDetail }

export type FolderDescendantColumnChrome = {
  ariaLabel: string
  loadingMessage: string
  title: string
  unavailableMessage: string
}

export type FolderDescendantColumnModel = {
  chrome: FolderDescendantColumnChrome
  contentState: FolderDescendantColumnState
  entries: FilesEntry[]
}

export type FolderColumnPreviewTarget = {
  parentFile: FilesDetail
  child: FilesEntry
  siblingEntries: FilesEntry[]
}

export type FolderColumnState = {
  containerPath: string[]
  selectionByContainer: Record<string, string>
  previewTarget: FolderColumnPreviewTarget | null
}

export type FolderColumnSelectionStatePlan = {
  nextContainerPath: string[]
  nextSelectionByContainer: Record<string, string>
  nextPreviewTarget: FolderColumnPreviewTarget
}

export type FolderColumnPrunedState = {
  nextContainerPath: string[]
  nextSelectionByContainer: Record<string, string>
  nextPreviewTarget: FolderColumnPreviewTarget | null
}

export type FolderDetailColumnModel = {
  columnPreviewParentFile: FilesDetail
  columnPreviewChild: FilesEntry | null
  columnPreviewSiblings: FilesEntry[]
  columnPreviewChildCount: number
  rootColumnSelectedUri: string | null
}

export type FolderDetailViewModel = {
  childActionMenu: FolderChildActionMenuChrome
  collectionChrome: FolderChildCollectionChrome
  contentState: FolderDetailContentState
  hasVisibleChildren: boolean
  sortedChildren: FilesEntry[]
  sortedCollectionRows: FolderChildCollectionRow[]
  toolbarChrome: FolderDetailToolbarChrome
  viewModeOptions: FolderDetailViewModeOption[]
  visibleChildCount: number
  visibleChildren: FilesEntry[]
}

export type FolderChildBatchSelectionActions = {
  copyLabel: string
  deleteLabel: string
}

export type FolderChildSelectionProjection = {
  batchSelectionActions: FolderChildBatchSelectionActions
  batchSelectionLabel: string
  childUriSet: Set<string>
  hasBatchSelection: boolean
  selectedChild: FilesEntry | null
  selectedChildren: FilesEntry[]
  selectedChildCount: number
}

export type FolderChildSelectionState = {
  selectedChildUri: string | null
  selectedChildUris: Set<string>
  selectionAnchorUri: string | null
}

export type FolderChildSelectionStatePlan = {
  nextSelectedChildUri: string | null
  nextSelectedChildUris: Set<string>
  nextSelectionAnchorUri: string | null
  changed: boolean
}

export type FolderChildSelectionModifiers = {
  shiftKey?: boolean
  metaKey?: boolean
  ctrlKey?: boolean
}

export type FolderChildKeyboardNavigationPlan = {
  handled: boolean
  nextChild: FilesEntry | null
  nextIndex: number
}

export function createFolderChildSelectionState(): FolderChildSelectionState {
  return {
    selectedChildUri: null,
    selectedChildUris: new Set(),
    selectionAnchorUri: null,
  }
}

export function createFolderDetailViewState(): FolderDetailViewState {
  return {
    sort: { key: 'name', direction: 'asc' },
    viewMode: 'list',
  }
}

export function projectFolderDetailViewMode({
  current,
  viewMode,
}: {
  current: FolderDetailViewState
  viewMode: FolderDetailViewMode
}): FolderDetailViewState {
  return {
    ...current,
    viewMode,
  }
}

export function projectFolderDetailSortKey({
  current,
  key,
}: {
  current: FolderDetailViewState
  key: FolderSortState['key']
}): FolderDetailViewState {
  return {
    ...current,
    sort: projectNextFolderSortState(current.sort, key),
  }
}

export function projectFolderChildSelectionStateFromPlan(
  plan: FolderChildSelectionStatePlan,
): FolderChildSelectionState {
  return {
    selectedChildUri: plan.nextSelectedChildUri,
    selectedChildUris: plan.nextSelectedChildUris,
    selectionAnchorUri: plan.nextSelectionAnchorUri,
  }
}

export function projectFolderChildSelectedChildUriPatch({
  current,
  selectedChildUri,
}: {
  current: FolderChildSelectionState
  selectedChildUri: string | null
}): FolderChildSelectionState {
  return {
    ...current,
    selectedChildUri,
  }
}

export function projectFolderChildKeyboardNavigationPlan({
  currentChildUri,
  key,
  sortedChildren,
}: {
  currentChildUri: string
  key: string
  sortedChildren: FilesEntry[]
}): FolderChildKeyboardNavigationPlan {
  const currentIndex = sortedChildren.findIndex((row) => row.uri === currentChildUri)
  if (!['ArrowDown', 'ArrowRight', 'ArrowUp', 'ArrowLeft', 'Home', 'End'].includes(key)) {
    return { handled: false, nextChild: null, nextIndex: -1 }
  }
  if (currentIndex < 0 || sortedChildren.length === 0) {
    return { handled: true, nextChild: null, nextIndex: -1 }
  }

  const nextIndex = (() => {
    if (key === 'Home') return 0
    if (key === 'End') return sortedChildren.length - 1
    if (key === 'ArrowUp' || key === 'ArrowLeft') return Math.max(0, currentIndex - 1)
    return Math.min(sortedChildren.length - 1, currentIndex + 1)
  })()

  return {
    handled: true,
    nextChild: sortedChildren[nextIndex] ?? null,
    nextIndex,
  }
}

function folderChildIconKind(entry: FilesEntry): FolderChildCollectionRow['iconKind'] {
  return entry.kind === 'container' ? 'folder' : 'file'
}

const FOLDER_DETAIL_VIEW_MODE_OPTIONS: Array<Omit<FolderDetailViewModeOption, 'active'>> = [
  { mode: 'list', label: '列表视图', iconKind: 'list' },
  { mode: 'columns', label: '分栏视图', iconKind: 'columns' },
  { mode: 'icons', label: '图标视图', iconKind: 'icons' },
]

const FOLDER_DETAIL_TOOLBAR_CHROME: FolderDetailToolbarChrome = {
  createFolderLabel: '新建文件夹',
  createMarkdownLabel: '新建 Markdown 文件',
  uploadInputLabel: '选择上传文件',
  uploadLabel: '上传文件',
}

const FOLDER_DETAIL_EMPTY_STATE_CHROME: FolderDetailEmptyStateChrome = {
  message: '当前容器没有可浏览子项。',
}

const FOLDER_DESCENDANT_COLUMN_LOADING_MESSAGE = '正在加载...'
const FOLDER_DESCENDANT_COLUMN_UNAVAILABLE_MESSAGE = '无法读取子文件夹。'

const FOLDER_CHILD_COLLECTION_ARIA_LABELS: Record<FolderDetailCollectionViewMode, string> = {
  list: 'Folder list view',
  icons: 'Folder icon view',
}

const FOLDER_CHILD_COLLECTION_SORT_HEADERS: FolderSortHeaderChrome[] = [
  { key: 'name', label: '名称', ariaLabel: '按名称排序', align: 'left' },
  { key: 'type', label: '类型', ariaLabel: '按类型排序', align: 'left' },
  { key: 'modified', label: '修改', ariaLabel: '按修改排序', align: 'left' },
  { key: 'size', label: '大小', ariaLabel: '按大小排序', align: 'right' },
]

export function projectFolderChildActionMenuChrome(): FolderChildActionMenuChrome {
  return {
    items: [
      { kind: 'open', label: '打开', trigger: 'explicit-open' },
      { kind: 'copy-uri', label: '复制 URI' },
      { kind: 'rename', label: '重命名', separatorBefore: true },
      { kind: 'copy', label: '复制到...' },
      { kind: 'move', label: '移动到...' },
      { kind: 'delete', label: '删除', destructive: true, separatorBefore: true },
    ],
  }
}

export function projectFolderChildCollectionChrome(
  viewMode: FolderDetailCollectionViewMode,
): FolderChildCollectionChrome {
  return {
    ariaLabel: FOLDER_CHILD_COLLECTION_ARIA_LABELS[viewMode],
    sortHeaders: FOLDER_CHILD_COLLECTION_SORT_HEADERS,
  }
}

export function isFileLevelSidecarEntry(file: FilesEntry): boolean {
  return file.kind === 'resource' && (
    file.name === '.meta' ||
    file.name === '.acl' ||
    file.name === '.acr' ||
    file.name.endsWith('.meta') ||
    file.name.endsWith('.acl') ||
    file.name.endsWith('.acr')
  )
}

export function getVisibleFolderChildren(children: FilesEntry[]): FilesEntry[] {
  return children.filter((child) => !isFileLevelSidecarEntry(child))
}

export function normalizeMarkdownFileName(value: string) {
  const trimmed = value.trim()
  return /\.md$/i.test(trimmed) ? trimmed : `${trimmed}.md`
}

export function sortFolderEntries(entries: FilesEntry[], sort: FolderSortState) {
  const compareNullableNumber = (left: number | null | undefined, right: number | null | undefined) => {
    if (left == null && right == null) return 0
    if (left == null) return 1
    if (right == null) return -1
    return left - right
  }
  const compareNullableText = (left: string | null | undefined, right: string | null | undefined) => {
    if (!left && !right) return 0
    if (!left) return 1
    if (!right) return -1
    return left.localeCompare(right, undefined, { numeric: true, sensitivity: 'base' })
  }
  const direction = sort.direction === 'asc' ? 1 : -1
  return [...entries].sort((left, right) => {
    const result = (() => {
      if (sort.key === 'type') return getFilesEntrySemanticLabel(left.semanticKind).localeCompare(getFilesEntrySemanticLabel(right.semanticKind))
      if (sort.key === 'modified') return compareNullableText(left.modifiedAt, right.modifiedAt)
      if (sort.key === 'size') return compareNullableNumber(left.size, right.size)
      return left.name.localeCompare(right.name, undefined, { numeric: true, sensitivity: 'base' })
    })()
    return result === 0 ? left.uri.localeCompare(right.uri) : result * direction
  })
}

export function projectFolderChildCollectionRow(entry: FilesEntry): FolderChildCollectionRow {
  return {
    entry,
    iconKind: folderChildIconKind(entry),
    typeLabel: getFilesEntrySemanticLabel(entry.semanticKind),
    modifiedLabel: formatDateTime(entry.modifiedAt),
    sizeLabel: formatBytes(entry.size),
  }
}

export function projectFolderColumnRow(entry: FilesEntry): FolderColumnRow {
  const iconKind = folderChildIconKind(entry)
  return {
    entry,
    iconKind,
    showDescendantIndicator: iconKind === 'folder',
  }
}

export function projectFolderColumnPanelModel({
  entries,
  sort,
}: {
  entries: FilesEntry[]
  sort: FolderSortState
}): FolderColumnPanelModel {
  const sortedEntries = sortFolderEntries(entries, sort)
  const sortedRows = sortedEntries.map(projectFolderColumnRow)
  return {
    actionMenu: projectFolderChildActionMenuChrome(),
    entryCount: entries.length,
    sortedEntries,
    sortedRows,
    hasSortedRows: sortedRows.length > 0,
  }
}

export function projectFolderDetailContentState({
  hasVisibleChildren,
  viewMode,
}: {
  hasVisibleChildren: boolean
  viewMode: FolderDetailViewMode
}): FolderDetailContentState {
  if (!hasVisibleChildren) {
    return {
      kind: 'empty',
      emptyState: FOLDER_DETAIL_EMPTY_STATE_CHROME,
    }
  }
  if (viewMode === 'columns') return { kind: 'columns' }
  return { kind: 'collection', viewMode }
}

export function projectNextFolderSortState(current: FolderSortState, key: FolderSortState['key']): FolderSortState {
  return {
    key,
    direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc',
  }
}

export function projectFolderDetailViewModel({
  children,
  sort,
  viewMode,
}: {
  children: FilesEntry[]
  sort: FolderSortState
  viewMode: FolderDetailViewMode
}): FolderDetailViewModel {
  const visibleChildren = getVisibleFolderChildren(children)
  const sortedChildren = sortFolderEntries(visibleChildren, sort)
  const sortedCollectionRows = sortedChildren.map(projectFolderChildCollectionRow)
  const visibleChildCount = visibleChildren.length
  const hasVisibleChildren = visibleChildCount > 0
  const collectionViewMode = viewMode === 'icons' ? 'icons' : 'list'

  return {
    childActionMenu: projectFolderChildActionMenuChrome(),
    collectionChrome: projectFolderChildCollectionChrome(collectionViewMode),
    contentState: projectFolderDetailContentState({
      hasVisibleChildren,
      viewMode,
    }),
    hasVisibleChildren,
    sortedChildren,
    sortedCollectionRows,
    toolbarChrome: FOLDER_DETAIL_TOOLBAR_CHROME,
    viewModeOptions: FOLDER_DETAIL_VIEW_MODE_OPTIONS.map((option) => ({
      ...option,
      active: option.mode === viewMode,
    })),
    visibleChildCount,
    visibleChildren,
  }
}

export function projectFolderDescendantColumnState({
  error,
  isLoading,
  parentFile,
}: {
  error: unknown
  isLoading: boolean
  parentFile: FilesDetail | null
}): FolderDescendantColumnState {
  if (isLoading) return { kind: 'loading' }
  if (error || !parentFile) return { kind: 'unavailable' }
  return { kind: 'ready', parentFile }
}

export function projectFolderDescendantColumnModel({
  containerUri,
  error,
  isLoading,
  parentFile,
}: {
  containerUri: string
  error: unknown
  isLoading: boolean
  parentFile: FilesDetail | null
}): FolderDescendantColumnModel {
  const title = parentFile?.name ?? folderColumnNameFromUri(containerUri)
  return {
    chrome: {
      ariaLabel: `Folder column ${title}`,
      loadingMessage: FOLDER_DESCENDANT_COLUMN_LOADING_MESSAGE,
      title,
      unavailableMessage: FOLDER_DESCENDANT_COLUMN_UNAVAILABLE_MESSAGE,
    },
    contentState: projectFolderDescendantColumnState({
      error,
      isLoading,
      parentFile,
    }),
    entries: parentFile ? getVisibleFolderChildren(parentFile.childEntries ?? []) : [],
  }
}

export function projectFolderColumnSelectionState({
  currentContainerPath,
  currentSelectionByContainer,
  rootContainerUri,
  parentFile,
  siblingEntries,
  child,
  columnDepth,
}: {
  currentContainerPath: string[]
  currentSelectionByContainer: Record<string, string>
  rootContainerUri: string
  parentFile: FilesDetail
  siblingEntries: FilesEntry[]
  child: FilesEntry
  columnDepth: number
}): FolderColumnSelectionStatePlan {
  const keptSelectionEntries = Object.entries(currentSelectionByContainer).filter(([containerUri]) => (
    containerUri === rootContainerUri || currentContainerPath.slice(0, columnDepth).includes(containerUri)
  ))
  const nextContainerPathPrefix = currentContainerPath.slice(0, columnDepth)

  return {
    nextContainerPath: child.kind === 'container'
      ? [...nextContainerPathPrefix, child.uri]
      : nextContainerPathPrefix,
    nextSelectionByContainer: {
      ...Object.fromEntries(keptSelectionEntries),
      [parentFile.uri]: child.uri,
    },
    nextPreviewTarget: {
      parentFile,
      child,
      siblingEntries,
    },
  }
}

export function createFolderColumnState(): FolderColumnState {
  return {
    containerPath: [],
    selectionByContainer: {},
    previewTarget: null,
  }
}

export function projectFolderColumnStateAfterSelection({
  current,
  rootContainerUri,
  parentFile,
  siblingEntries,
  child,
  columnDepth,
}: {
  current: FolderColumnState
  rootContainerUri: string
  parentFile: FilesDetail
  siblingEntries: FilesEntry[]
  child: FilesEntry
  columnDepth: number
}): FolderColumnState {
  const plan = projectFolderColumnSelectionState({
    currentContainerPath: current.containerPath,
    currentSelectionByContainer: current.selectionByContainer,
    rootContainerUri,
    parentFile,
    siblingEntries,
    child,
    columnDepth,
  })

  return {
    containerPath: plan.nextContainerPath,
    selectionByContainer: plan.nextSelectionByContainer,
    previewTarget: plan.nextPreviewTarget,
  }
}

export function projectFolderDetailColumnModel({
  file,
  visibleChildren,
  selectedChild,
  selectedChildUri,
  columnSelectionByContainer,
  columnPreviewTarget,
}: {
  file: FilesDetail
  visibleChildren: FilesEntry[]
  selectedChild: FilesEntry | null
  selectedChildUri: string | null
  columnSelectionByContainer: Record<string, string>
  columnPreviewTarget: FolderColumnPreviewTarget | null
}): FolderDetailColumnModel {
  const columnPreviewSiblings = columnPreviewTarget?.siblingEntries ?? visibleChildren

  return {
    columnPreviewParentFile: columnPreviewTarget?.parentFile ?? file,
    columnPreviewChild: columnPreviewTarget?.child ?? selectedChild,
    columnPreviewSiblings,
    columnPreviewChildCount: columnPreviewSiblings.length,
    rootColumnSelectedUri: columnSelectionByContainer[file.uri] ?? selectedChildUri,
  }
}

export function pruneFolderColumnState({
  columnContainerPath,
  columnSelectionByContainer,
  columnPreviewTarget,
  rootContainerUri,
  childUriSet,
}: {
  columnContainerPath: string[]
  columnSelectionByContainer: Record<string, string>
  columnPreviewTarget: FolderColumnPreviewTarget | null
  rootContainerUri: string
  childUriSet: Set<string>
}): FolderColumnPrunedState {
  const nextContainerPath = columnContainerPath.length === 0 || childUriSet.has(columnContainerPath[0]!)
    ? columnContainerPath
    : []
  const selectedRootChildUri = columnSelectionByContainer[rootContainerUri]
  let nextSelectionByContainer = columnSelectionByContainer

  if (selectedRootChildUri && !childUriSet.has(selectedRootChildUri)) {
    nextSelectionByContainer = { ...columnSelectionByContainer }
    delete nextSelectionByContainer[rootContainerUri]
  }

  const nextPreviewTarget = (() => {
    if (!columnPreviewTarget) return columnPreviewTarget
    if (columnPreviewTarget.parentFile.uri !== rootContainerUri) return columnPreviewTarget
    return childUriSet.has(columnPreviewTarget.child.uri) ? columnPreviewTarget : null
  })()

  return {
    nextContainerPath,
    nextSelectionByContainer,
    nextPreviewTarget,
  }
}

export function projectFolderColumnStateAfterPrune({
  current,
  rootContainerUri,
  childUriSet,
}: {
  current: FolderColumnState
  rootContainerUri: string
  childUriSet: Set<string>
}): FolderColumnState {
  const pruned = pruneFolderColumnState({
    columnContainerPath: current.containerPath,
    columnSelectionByContainer: current.selectionByContainer,
    columnPreviewTarget: current.previewTarget,
    rootContainerUri,
    childUriSet,
  })

  if (
    pruned.nextContainerPath === current.containerPath
    && pruned.nextSelectionByContainer === current.selectionByContainer
    && pruned.nextPreviewTarget === current.previewTarget
  ) {
    return current
  }

  return {
    containerPath: pruned.nextContainerPath,
    selectionByContainer: pruned.nextSelectionByContainer,
    previewTarget: pruned.nextPreviewTarget,
  }
}

export function projectFolderChildSelectionProjection({
  visibleChildren,
  sortedChildren,
  selectedChildUri,
  selectedChildUris,
}: {
  visibleChildren: FilesEntry[]
  sortedChildren: FilesEntry[]
  selectedChildUri: string | null
  selectedChildUris: Set<string>
}): FolderChildSelectionProjection {
  const childUriSet = new Set(visibleChildren.map((child) => child.uri))
  const selectedChild = visibleChildren.find((child) => child.uri === selectedChildUri) ?? null
  const selectedChildren = sortedChildren.filter((child) => selectedChildUris.has(child.uri))
  const selectedChildCount = selectedChildren.length

  return {
    batchSelectionActions: {
      copyLabel: '复制所选 URI',
      deleteLabel: '删除所选项',
    },
    batchSelectionLabel: `已选择 ${selectedChildCount} 项`,
    childUriSet,
    hasBatchSelection: selectedChildCount > 1,
    selectedChild,
    selectedChildren,
    selectedChildCount,
  }
}

export function projectFolderChildRangeSelectionUris({
  sortedChildren,
  anchorUri,
  childUri,
}: {
  sortedChildren: FilesEntry[]
  anchorUri: string
  childUri: string
}) {
  const anchorIndex = sortedChildren.findIndex((entry) => entry.uri === anchorUri)
  const childIndex = sortedChildren.findIndex((entry) => entry.uri === childUri)
  if (anchorIndex < 0 || childIndex < 0) return null

  const start = Math.min(anchorIndex, childIndex)
  const end = Math.max(anchorIndex, childIndex)
  return sortedChildren.slice(start, end + 1).map((entry) => entry.uri)
}

export function toggleFolderChildSelectionUri(selectedChildUris: Set<string>, childUri: string) {
  const next = new Set(selectedChildUris)
  if (next.has(childUri)) next.delete(childUri)
  else next.add(childUri)
  return next
}

function sameFolderChildUriSet(left: Set<string>, right: Set<string>) {
  if (left.size !== right.size) return false
  for (const uri of left) {
    if (!right.has(uri)) return false
  }
  return true
}

function projectFolderChildSelectionStatePlan({
  nextSelectedChildUri,
  nextSelectedChildUris,
  nextSelectionAnchorUri,
  selectedChildUri,
  selectedChildUris,
  selectionAnchorUri,
}: {
  nextSelectedChildUri: string | null
  nextSelectedChildUris: Set<string>
  nextSelectionAnchorUri: string | null
  selectedChildUri: string | null
  selectedChildUris: Set<string>
  selectionAnchorUri: string | null
}): FolderChildSelectionStatePlan {
  return {
    nextSelectedChildUri,
    nextSelectedChildUris,
    nextSelectionAnchorUri,
    changed: (
      nextSelectedChildUri !== selectedChildUri
      || !sameFolderChildUriSet(nextSelectedChildUris, selectedChildUris)
      || nextSelectionAnchorUri !== selectionAnchorUri
    ),
  }
}

export function projectFolderChildSelectionState({
  childUri,
  modifiers,
  selectedChildUri,
  selectedChildUris,
  selectionAnchorUri,
  sortedChildren,
}: {
  childUri: string
  modifiers?: FolderChildSelectionModifiers
  selectedChildUri: string | null
  selectedChildUris: Set<string>
  selectionAnchorUri: string | null
  sortedChildren: FilesEntry[]
}): FolderChildSelectionStatePlan {
  if (modifiers?.shiftKey && selectionAnchorUri) {
    const rangeSelectionUris = projectFolderChildRangeSelectionUris({
      sortedChildren,
      anchorUri: selectionAnchorUri,
      childUri,
    })
    if (rangeSelectionUris) {
      return projectFolderChildSelectionStatePlan({
        nextSelectedChildUri: childUri,
        nextSelectedChildUris: new Set(rangeSelectionUris),
        nextSelectionAnchorUri: selectionAnchorUri,
        selectedChildUri,
        selectedChildUris,
        selectionAnchorUri,
      })
    }
  }

  if (modifiers?.metaKey || modifiers?.ctrlKey) {
    return projectFolderChildSelectionStatePlan({
      nextSelectedChildUri: childUri,
      nextSelectedChildUris: toggleFolderChildSelectionUri(selectedChildUris, childUri),
      nextSelectionAnchorUri: childUri,
      selectedChildUri,
      selectedChildUris,
      selectionAnchorUri,
    })
  }

  return projectFolderChildSelectionStatePlan({
    nextSelectedChildUri: childUri,
    nextSelectedChildUris: new Set([childUri]),
    nextSelectionAnchorUri: childUri,
    selectedChildUri,
    selectedChildUris,
    selectionAnchorUri,
  })
}

export function projectFolderChildContextMenuSelectionState({
  childUri,
  selectedChildUri,
  selectedChildUris,
  selectionAnchorUri,
}: {
  childUri: string
  selectedChildUri: string | null
  selectedChildUris: Set<string>
  selectionAnchorUri: string | null
}): FolderChildSelectionStatePlan {
  if (selectedChildUris.has(childUri)) {
    return projectFolderChildSelectionStatePlan({
      nextSelectedChildUri: childUri,
      nextSelectedChildUris: selectedChildUris,
      nextSelectionAnchorUri: selectionAnchorUri,
      selectedChildUri,
      selectedChildUris,
      selectionAnchorUri,
    })
  }

  return projectFolderChildSelectionStatePlan({
    nextSelectedChildUri: childUri,
    nextSelectedChildUris: new Set([childUri]),
    nextSelectionAnchorUri: childUri,
    selectedChildUri,
    selectedChildUris,
    selectionAnchorUri,
  })
}

export function pruneFolderChildSelectionState({
  childUriSet,
  selectedChildUri,
  selectedChildUris,
  selectionAnchorUri,
}: {
  childUriSet: Set<string>
  selectedChildUri: string | null
  selectedChildUris: Set<string>
  selectionAnchorUri: string | null
}): FolderChildSelectionStatePlan {
  const nextSelectedChildUri = selectedChildUri && !childUriSet.has(selectedChildUri)
    ? null
    : selectedChildUri
  const nextSelectionAnchorUri = selectionAnchorUri && !childUriSet.has(selectionAnchorUri)
    ? null
    : selectionAnchorUri

  let nextSelectedChildUris = selectedChildUris
  if ([...selectedChildUris].some((uri) => !childUriSet.has(uri))) {
    nextSelectedChildUris = new Set([...selectedChildUris].filter((uri) => childUriSet.has(uri)))
  }

  return {
    nextSelectedChildUri,
    nextSelectedChildUris,
    nextSelectionAnchorUri,
    changed: (
      nextSelectedChildUri !== selectedChildUri
      || nextSelectedChildUris !== selectedChildUris
      || nextSelectionAnchorUri !== selectionAnchorUri
    ),
  }
}

export function removeFolderChildSelectionUris({
  removedUris,
  selectedChildUri,
  selectedChildUris,
  selectionAnchorUri,
}: {
  removedUris: Set<string>
  selectedChildUri: string | null
  selectedChildUris: Set<string>
  selectionAnchorUri: string | null
}): FolderChildSelectionStatePlan {
  const nextSelectedChildUris = new Set([...selectedChildUris].filter((uri) => !removedUris.has(uri)))
  const nextSelectedChildUri = selectedChildUri && removedUris.has(selectedChildUri)
    ? null
    : selectedChildUri
  const nextSelectionAnchorUri = selectionAnchorUri && removedUris.has(selectionAnchorUri)
    ? null
    : selectionAnchorUri

  return {
    nextSelectedChildUri,
    nextSelectedChildUris,
    nextSelectionAnchorUri,
    changed: (
      nextSelectedChildUri !== selectedChildUri
      || nextSelectedChildUris.size !== selectedChildUris.size
      || nextSelectionAnchorUri !== selectionAnchorUri
    ),
  }
}

export function folderColumnNameFromUri(uri: string) {
  const trimmed = uri.replace(/\/$/, '')
  const segment = trimmed.split('/').filter(Boolean).pop() ?? uri
  try {
    return decodeURIComponent(segment)
  } catch {
    return segment
  }
}
