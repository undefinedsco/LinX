import type { FilesListSortField } from '../../domain/list/list-view-model'

export type FilesListColumnHeaderModel = {
  id: FilesListSortField
  label: string
  className: string
}

const FILES_LIST_COLUMN_HEADERS: readonly FilesListColumnHeaderModel[] = [
  { id: 'name', label: '名称', className: 'flex-1 flex items-center gap-1 hover:text-foreground' },
  { id: 'kind', label: '类别', className: 'w-16 hidden md:flex items-center gap-1 hover:text-foreground' },
  { id: 'mimeType', label: '类型', className: 'w-20 hidden md:flex items-center gap-1 hover:text-foreground' },
  { id: 'size', label: '大小', className: 'w-16 hidden md:flex items-center gap-1 justify-end hover:text-foreground' },
  { id: 'modifiedAt', label: '修改时间', className: 'w-28 hidden lg:flex items-center gap-1 justify-end hover:text-foreground' },
]

export function projectFilesListColumnHeaders() {
  return FILES_LIST_COLUMN_HEADERS
}
