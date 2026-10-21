export type FilesAddActionId =
  | 'create-document'
  | 'create-table'
  | 'create-folder'
  | 'upload-files'
  | 'upload-folder'
  | 'add-web'

export type FilesAddActionModel = {
  id: FilesAddActionId
  label: string
  iconKind: 'document' | 'table' | 'folder' | 'upload-file' | 'upload-folder' | 'web'
  disabled: boolean
}

export type FilesAddMenuModel = {
  triggerLabel: string
  destinationLabel: string
  actions: FilesAddActionModel[]
}

export type FilesAddLocation =
  | { kind: 'all' | 'recent' | 'local-workspace' }
  | { kind: 'container'; containerUri?: string }

/**
 * Where 添加 writes. With no folder selected it falls back to the top of the Pod. The Pod base
 * has no trailing slash (and may be path-based, `/test`), so it is made a container first;
 * otherwise `new URL(name, base)` resolves against the server origin and escapes the Pod.
 */
export function projectFilesAddContainerUri(location: FilesAddLocation, podRootUri?: string | null): string | null {
  if (location.kind === 'container' && location.containerUri) return location.containerUri
  return podRootUri ? (podRootUri.endsWith('/') ? podRootUri : `${podRootUri}/`) : null
}

export function projectFilesAddMenuModel(containerUri: string | null): FilesAddMenuModel {
  const disabled = !containerUri
  return {
    triggerLabel: '添加',
    destinationLabel: containerUri ? `添加到 ${containerUri}` : '先选择一个文件夹',
    actions: [
      { id: 'create-document', label: '新建文档', iconKind: 'document', disabled },
      { id: 'create-table', label: '新建表格', iconKind: 'table', disabled },
      { id: 'create-folder', label: '新建文件夹', iconKind: 'folder', disabled },
      { id: 'upload-files', label: '上传文件', iconKind: 'upload-file', disabled },
      { id: 'upload-folder', label: '上传文件夹', iconKind: 'upload-folder', disabled },
      { id: 'add-web', label: '添加网页', iconKind: 'web', disabled },
    ],
  }
}
