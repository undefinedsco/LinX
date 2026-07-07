import type { FilesDetail, FilesEntry } from '../resource/resource-model'
import { getFilesEntryOpenMode } from '../resource/resource-semantics'
import { createContainerNodeId } from '../resource/tree-model'

export type FolderChildOpenTrigger = 'click' | 'double-click' | 'enter' | 'explicit-open'

export type FolderChildOpenDecision =
  | { type: 'noop' }
  | { type: 'select-local-preview'; fileUri: string }
  | { type: 'browse-container'; treeNodeId: string }
  | { type: 'open-editable-sheet'; file: FilesDetail }
  | { type: 'select-file-preview'; fileUri: string }

export function fileEntryToFolderChildDetail(child: FilesEntry): FilesDetail {
  return {
    ...child,
    headers: {},
    previewText: null,
    previewUnavailableReason: '文件夹预览只显示轻量摘要；正文在文件详情中读取。',
  }
}

export function buildFolderChildRenameDestination(child: FilesEntry, nextNameInput: string): string | null {
  const result = resolveFolderChildRenameDestination({
    child,
    input: nextNameInput,
  })
  return result.ok ? result.destinationUri : null
}

export type FolderChildRenameDestinationResult =
  | { ok: true; destinationUri: string }
  | { ok: false; reason: 'empty' | 'unchanged' | 'conflict' | 'escape'; destinationUri?: string }

export function resolveFolderChildRenameDestination({
  child,
  input,
  siblingEntries = [],
}: {
  child: FilesEntry
  input: string
  siblingEntries?: FilesEntry[]
}): FolderChildRenameDestinationResult {
  const nextName = input.trim()
  if (!nextName) return { ok: false, reason: 'empty' }
  if (nextName === child.name) return { ok: false, reason: 'unchanged' }
  if (/^(?:https?:)?\/\//i.test(nextName) || nextName.includes('/') || nextName.includes('\\') || nextName.split(/[\\/]+/).includes('..')) {
    return { ok: false, reason: 'escape' }
  }

  const parent = child.parentUri.endsWith('/') ? child.parentUri : `${child.parentUri}/`
  const destination = new URL(nextName, parent)
  if (child.kind === 'container' && !destination.pathname.endsWith('/')) {
    destination.pathname = `${destination.pathname}/`
  }
  const destinationUri = destination.href
  if (siblingEntries.some((entry) => entry.uri === destinationUri && entry.uri !== child.uri)) {
    return { ok: false, reason: 'conflict', destinationUri }
  }
  return { ok: true, destinationUri }
}

export function buildFolderChildCopyName(child: FilesEntry, siblingEntries: FilesEntry[] = []): string {
  const siblingNames = new Set(siblingEntries.map((entry) => entry.name))
  const name = child.name.trim() || 'Untitled'
  const dotIndex = child.kind === 'resource' ? name.lastIndexOf('.') : -1
  const hasExtension = dotIndex > 0 && dotIndex < name.length - 1
  const stem = hasExtension ? name.slice(0, dotIndex) : name
  const extension = hasExtension ? name.slice(dotIndex) : ''
  const firstCandidate = `${stem} copy${extension}`
  if (!siblingNames.has(firstCandidate)) return firstCandidate

  let index = 2
  while (siblingNames.has(`${stem} copy ${index}${extension}`)) index += 1
  return `${stem} copy ${index}${extension}`
}

export type FolderChildTransferDestinationResult =
  | { ok: true; destinationUri: string }
  | { ok: false; reason: 'empty' | 'unchanged' | 'conflict' | 'cross-pod' | 'escape'; destinationUri?: string }

export function resolveFolderChildTransferDestination({
  child,
  input,
  containerUri,
  siblingEntries = [],
}: {
  child: FilesEntry
  input: string
  containerUri: string
  siblingEntries?: FilesEntry[]
}): FolderChildTransferDestinationResult {
  const trimmedInput = input.trim()
  if (!trimmedInput) return { ok: false, reason: 'empty' }

  const container = containerUri.endsWith('/') ? containerUri : `${containerUri}/`
  const isDirectoryTarget = /\/$/.test(trimmedInput)
  const targetInput = isDirectoryTarget
    ? `${trimmedInput}${child.name}`
    : trimmedInput
  const isAbsoluteUriInput = /^[a-z][a-z\d+.-]*:/i.test(trimmedInput) || /^\/\//.test(trimmedInput)

  let destination: URL
  try {
    destination = new URL(targetInput, container)
  } catch {
    return { ok: false, reason: 'empty' }
  }

  if (child.kind === 'container' && !destination.pathname.endsWith('/')) {
    destination.pathname = `${destination.pathname}/`
  }

  const destinationUri = destination.href
  const containerUrl = new URL(container)
  if (containerUrl.origin !== destination.origin) {
    return { ok: false, reason: 'cross-pod', destinationUri }
  }
  if (trimmedInput.split(/[\\/]+/).includes('..')) {
    return { ok: false, reason: 'escape', destinationUri }
  }
  if (!destinationUri.startsWith(containerUrl.href)) {
    return { ok: false, reason: 'escape', destinationUri }
  }
  if (isAbsoluteUriInput) {
    return { ok: false, reason: 'cross-pod', destinationUri }
  }
  if (destinationUri === child.uri) {
    return { ok: false, reason: 'unchanged' }
  }
  if (siblingEntries.some((entry) => entry.uri === destinationUri)) {
    return { ok: false, reason: 'conflict', destinationUri }
  }
  return { ok: true, destinationUri }
}

export function resolveFolderChildOpenDecision(
  child: FilesEntry,
  trigger: FolderChildOpenTrigger,
): FolderChildOpenDecision {
  const openMode = getFilesEntryOpenMode(child)

  if (trigger === 'click') return { type: 'select-local-preview', fileUri: child.uri }

  if (openMode === 'browse-container') {
    return { type: 'browse-container', treeNodeId: createContainerNodeId(child.uri) }
  }

  if (openMode === 'editable-file-sheet') {
    return { type: 'open-editable-sheet', file: fileEntryToFolderChildDetail(child) }
  }

  return { type: 'select-file-preview', fileUri: child.uri }
}
