import {
  resolveFolderChildOpenDecision,
  type FolderChildOpenTrigger,
} from '../../domain/folder/folder-child-open'
import type { FilesDetail, FilesEntry } from '../../domain/resource/resource-model'

export function planFolderChildOpenEffect(
  child: FilesEntry,
  trigger: FolderChildOpenTrigger,
) {
  return resolveFolderChildOpenDecision(child, trigger)
}

export function projectFolderChildCopyText(child: FilesEntry) {
  return child.uri
}

export function projectSelectedFolderChildCopyText(children: FilesEntry[]) {
  return children.map((child) => child.uri).join('\n')
}

export function shouldClearFolderChildSheet({
  sheetChild,
  childUriSet,
}: {
  sheetChild: FilesDetail | null
  childUriSet: Set<string>
}) {
  return !!sheetChild && !childUriSet.has(sheetChild.uri)
}

export type { FolderChildOpenTrigger }
