export type FilesAddActionId =
  | 'create-document'
  | 'create-folder'
  | 'upload-files'
  | 'upload-folder'
  | 'add-web'

export type FilesAddActionModel = {
  id: FilesAddActionId
  label: string
  iconKind: 'document' | 'folder' | 'upload-file' | 'upload-folder' | 'web'
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

export function projectFilesAddContainerUri(location: FilesAddLocation): string | null {
  return location.kind === 'container' && location.containerUri ? location.containerUri : null
}

export function projectFilesAddMenuModel(containerUri: string | null): FilesAddMenuModel {
  const disabled = !containerUri
  return {
    triggerLabel: '添加',
    destinationLabel: containerUri ? `添加到 ${containerUri}` : '先选择一个文件夹',
    actions: [
      { id: 'create-document', label: '新建文档', iconKind: 'document', disabled },
      { id: 'create-folder', label: '新建文件夹', iconKind: 'folder', disabled },
      { id: 'upload-files', label: '上传文件', iconKind: 'upload-file', disabled },
      { id: 'upload-folder', label: '上传文件夹', iconKind: 'upload-folder', disabled },
      { id: 'add-web', label: '添加网页', iconKind: 'web', disabled },
    ],
  }
}
