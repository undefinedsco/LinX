export type FolderUploadFileLike = {
  name: string
  type?: string
}

export type FolderUploadResourcePlan = {
  fileName: string
  resource: {
    uri: string
    mimeType: string
  }
  contentKind: 'text' | 'blob'
}

export function isFolderUploadTextResource(uploadedFile: FolderUploadFileLike): boolean {
  const mimeType = uploadedFile.type ?? ''
  const name = uploadedFile.name.toLowerCase()
  return mimeType.startsWith('text/')
    || mimeType === 'application/json'
    || mimeType === 'application/ld+json'
    || mimeType === 'application/xml'
    || name.endsWith('.md')
    || name.endsWith('.txt')
    || name.endsWith('.ttl')
    || name.endsWith('.json')
}

export function projectFolderUploadResourcePlan({
  uploadedFile,
  containerUri,
}: {
  uploadedFile: FolderUploadFileLike
  containerUri: string
}): FolderUploadResourcePlan | null {
  const fileName = uploadedFile.name.split(/[\\/]/).filter(Boolean).pop()?.trim()
  if (!fileName) return null

  const mimeType = uploadedFile.type
    || (fileName.toLowerCase().endsWith('.md') ? 'text/markdown' : 'application/octet-stream')

  return {
    fileName,
    resource: {
      uri: new URL(fileName, containerUri).toString(),
      mimeType,
    },
    contentKind: isFolderUploadTextResource(uploadedFile) ? 'text' : 'blob',
  }
}
