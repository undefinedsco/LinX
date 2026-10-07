import type { FilesListSortField } from '../../domain/list/list-view-model'

export type FilesListColumnHeaderModel = {
  id: FilesListSortField
  label: string
  className: string
}

const FILES_LIST_COLUMN_HEADERS: readonly FilesListColumnHeaderModel[] = [
  { id: 'name', label: '名称', className: 'flex-1 flex items-center gap-1 hover:text-foreground' },
]

const FILES_LIST_SORT_OPTIONS: ReadonlyArray<Pick<FilesListColumnHeaderModel, 'id' | 'label'>> = [
  { id: 'name', label: '名称' },
  { id: 'kind', label: '类别' },
  { id: 'mimeType', label: '类型' },
  { id: 'size', label: '大小' },
  { id: 'modifiedAt', label: '修改时间' },
]

export function projectFilesListColumnHeaders() {
  return FILES_LIST_COLUMN_HEADERS
}

export function projectFilesListSortOptions() {
  return FILES_LIST_SORT_OPTIONS
}
