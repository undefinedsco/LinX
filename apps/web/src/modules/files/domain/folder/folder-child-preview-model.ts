import { formatBytes, formatDateTime, getFolderChildPreviewRows } from '../detail/detail-metadata'
import type { FilesDetail, FilesEntry } from '../resource/resource-model'
import {
  getFilesEntryOpenMode,
  getFilesEntrySemanticLabel,
  resolveFilesSidecarOwnerTarget,
} from '../resource/resource-semantics'

export type FolderChildPreviewChrome = {
  ariaLabel: string
  openSelectedLabel: string
}

export type FolderChildPreviewModel = {
  childDetail: FilesDetail | null
  childSidecarOwnerTarget: ReturnType<typeof resolveFilesSidecarOwnerTarget> | null
  childSubtitle: string | null
  childSummary: string | null
  chrome: FolderChildPreviewChrome
  heading: string
  rows: ReturnType<typeof getFolderChildPreviewRows>
}

const FOLDER_CHILD_PREVIEW_CHROME: FolderChildPreviewChrome = {
  ariaLabel: 'Folder child preview',
  openSelectedLabel: '打开选中项',
}

export function projectFolderChildPreviewModel({
  child,
  childCount,
  file,
}: {
  child: FilesEntry | null
  childCount: number
  file: FilesDetail
}): FolderChildPreviewModel {
  return {
    childDetail: child ? { ...child, headers: {}, previewText: null } as FilesDetail : null,
    childSidecarOwnerTarget: child ? resolveFilesSidecarOwnerTarget(child) : null,
    childSubtitle: child ? projectFolderChildSubtitle(child) : null,
    childSummary: child ? getFolderChildPreviewSummary(child) : null,
    chrome: FOLDER_CHILD_PREVIEW_CHROME,
    heading: child ? '选中项' : '文件夹预览',
    rows: getFolderChildPreviewRows(file, child, childCount),
  }
}

function projectFolderChildSubtitle(child: FilesEntry): string {
  return [
    getFilesEntrySemanticLabel(child.semanticKind),
    formatBytes(child.size),
    formatDateTime(child.modifiedAt),
  ].filter((part) => part !== '—').join(' · ')
}

function getFolderChildPreviewSummary(child: FilesEntry): string {
  if (child.summary) return child.summary
  if (child.kind === 'container') return '双击或打开以进入此文件夹。'
  if (child.mimeType?.startsWith('image/') || child.mimeType?.startsWith('video/') || child.mimeType?.startsWith('audio/')) {
    return '打开后查看预览。'
  }
  if (getFilesEntryOpenMode(child) === 'editable-file-sheet') return '打开后查看和编辑完整内容。'
  return '打开后查看详情。'
}
