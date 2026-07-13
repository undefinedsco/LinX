export type FolderUploadFileLike = {
  name: string
  type?: string
  webkitRelativePath?: string
}

export type FolderUploadResourcePlan = {
  fileName: string
  resource: {
    uri: string
    mimeType: string
  }
  contentKind: 'text' | 'blob'
}

export type FolderUploadBatchPlan = {
  folders: Array<{
    containerUri: string
    name: string
    uri: string
  }>
  resources: Array<FolderUploadResourcePlan & {
    fileIndex: number
  }>
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

function splitSafeRelativePath(uploadedFile: FolderUploadFileLike): string[] {
  const relativePath = uploadedFile.webkitRelativePath?.trim()
  const rawSegments = relativePath
    ? relativePath.split(/[\\/]/u)
    : [uploadedFile.name.split(/[\\/]/u).filter(Boolean).pop() ?? '']

  return rawSegments
    .map((segment) => segment.trim())
    .filter((segment) => segment && segment !== '.' && segment !== '..')
}

function appendResourcePathSegment(containerUri: string, segment: string, container: boolean): string {
  const suffix = container ? '/' : ''
  return new URL(`${encodeURIComponent(segment)}${suffix}`, containerUri).toString()
}

export function projectFolderUploadBatchPlan({
  uploadedFiles,
  containerUri,
}: {
  uploadedFiles: FolderUploadFileLike[]
  containerUri: string
}): FolderUploadBatchPlan {
  const folders: FolderUploadBatchPlan['folders'] = []
  const resources: FolderUploadBatchPlan['resources'] = []
  const plannedFolderUris = new Set<string>()

  uploadedFiles.forEach((uploadedFile, fileIndex) => {
    const pathSegments = splitSafeRelativePath(uploadedFile)
    const fileName = pathSegments[pathSegments.length - 1]
    if (!fileName) return

    let parentUri = containerUri
    for (const folderName of pathSegments.slice(0, -1)) {
      const uri = appendResourcePathSegment(parentUri, folderName, true)
      if (!plannedFolderUris.has(uri)) {
        plannedFolderUris.add(uri)
        folders.push({ containerUri: parentUri, name: folderName, uri })
      }
      parentUri = uri
    }

    const resourcePlan = projectFolderUploadResourcePlan({
      uploadedFile: { ...uploadedFile, name: fileName },
      containerUri: parentUri,
    })
    if (!resourcePlan) return
    resources.push({
      ...resourcePlan,
      fileIndex,
      resource: {
        ...resourcePlan.resource,
        uri: appendResourcePathSegment(parentUri, fileName, false),
      },
    })
  })

  return { folders, resources }
}
