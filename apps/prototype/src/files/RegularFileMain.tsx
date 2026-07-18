import { FolderOverview } from './FolderView'
import { RegularFileSurface } from './RegularFileSurface'
import { folderSamples } from './files-model'
import type { FileOpenSample, FilesFolderId, FilesSelection, FolderChildItem, StoredFileContent } from './files-types'
import { ResourceDeniedMain } from './ResourceDeniedMain'
import type { FilePropertyState } from './FileEditorSheet'

export function RegularFileMain({
  selection,
  folderId,
  openedChild,
  detailOpen,
  onToggleDetail,
  onCloseDetail,
  onOpenSelection,
  onNavigateFolder,
  isFileFavorite,
  fileContentsByPath,
  filePropertiesByPath,
  onChangeFileContent,
  onChangeFileProperties,
  onToggleFileFavorite,
  notify,
}: {
  selection: Exclude<FilesSelection, 'structuredVocab' | 'structuredVocabShapes' | 'structuredVocabNamespaces' | 'structuredData' | 'structuredEmpty'>
  folderId: FilesFolderId
  openedChild?: FolderChildItem | null
  detailOpen: boolean
  onToggleDetail: () => void
  onCloseDetail: () => void
  onOpenSelection?: (selection: FilesSelection, child?: FolderChildItem) => void
  onNavigateFolder?: (folder: FilesFolderId) => void
  fileContentsByPath?: Record<string, StoredFileContent>
  filePropertiesByPath?: Record<string, FilePropertyState>
  isFileFavorite?: (path: string) => boolean
  onChangeFileContent?: (path: string, content: StoredFileContent) => void
  onChangeFileProperties?: (path: string, properties: FilePropertyState) => void
  onToggleFileFavorite?: (file: FileOpenSample) => void
  notify?: (title: string, kind?: 'ok' | 'err') => void
}) {
  const folder = folderSamples[folderId]

  if (selection === 'folderRoot' || selection === 'folder') {
    return (
      <FolderOverview
        folder={folder}
        detailOpen={detailOpen}
        fileContentsByPath={fileContentsByPath}
        filePropertiesByPath={filePropertiesByPath}
        onChangeFileContent={onChangeFileContent}
        onChangeFileProperties={onChangeFileProperties}
        onToggleDetail={onToggleDetail}
        onOpenChild={(child) => {
          if (child.targetFolder) onNavigateFolder?.(child.targetFolder)
          else if (child.targetSelection) onOpenSelection?.(child.targetSelection, child)
        }}
        isFileFavorite={isFileFavorite}
        onToggleFileFavorite={onToggleFileFavorite}
        notify={notify}
      />
    )
  }

  if (selection === 'restricted') {
    return <ResourceDeniedMain notify={notify} />
  }

  return (
    <RegularFileSurface
      selection={selection}
      folderId={folderId}
      openedChild={openedChild}
      detailOpen={detailOpen}
      fileContentsByPath={fileContentsByPath}
      filePropertiesByPath={filePropertiesByPath}
      onChangeFileContent={onChangeFileContent}
      onChangeFileProperties={onChangeFileProperties}
      onToggleDetail={onToggleDetail}
      onCloseDetail={onCloseDetail}
      isFileFavorite={isFileFavorite}
      onToggleFileFavorite={onToggleFileFavorite}
      notify={notify}
    />
  )
}
