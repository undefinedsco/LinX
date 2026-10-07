import {
  createContainerNodeId,
} from '../resource/tree-model'
import type { FilesEntry } from '../resource/resource-model'
import { getFilesEntryOpenMode } from '../resource/resource-semantics'

export type FilesListOpenTrigger = 'click' | 'modifier-click' | 'double-click' | 'enter' | 'explicit-open'

export type FilesListOpenDecision =
  | { type: 'select-file'; fileUri: string }
  | { type: 'browse-container'; treeNodeId: string }
  | { type: 'open-editable-inline'; fileUri: string }
  | { type: 'open-editable-sheet'; fileUri: string }
  | { type: 'select-file-preview'; fileUri: string }

export function resolveFilesListOpenDecision(
  file: FilesEntry,
  trigger: FilesListOpenTrigger,
): FilesListOpenDecision {
  const openMode = getFilesEntryOpenMode(file)

  if (trigger === 'click') {
    return { type: 'select-file', fileUri: file.uri }
  }

  if (openMode === 'browse-container') {
    return { type: 'browse-container', treeNodeId: createContainerNodeId(file.uri) }
  }

  if (trigger === 'modifier-click') {
    return openMode === 'editable-file-sheet'
      ? { type: 'open-editable-sheet', fileUri: file.uri }
      : { type: 'select-file-preview', fileUri: file.uri }
  }

  if (openMode === 'editable-file-sheet') {
    return { type: 'open-editable-inline', fileUri: file.uri }
  }

  return { type: 'select-file-preview', fileUri: file.uri }
}
