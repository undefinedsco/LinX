import { FolderMain } from './FolderView'
import { RegularFileSurface } from './RegularFileSurface'
import { filesRootFolderOpenSample, folderOpenSample } from './files-model'
import type { FileOpenSample, FilesSelection, StoredFileContent } from './files-types'
import { ResourceDeniedMain } from './ResourceDeniedMain'
import type { FilePropertyState } from './FileEditorSheet'

export function RegularFileMain({
  selection,
  detailOpen,
  onToggleDetail,
  onCloseDetail,
  onOpenSelection,
  isFileFavorite,
  fileContentsByPath,
  filePropertiesByPath,
  onChangeFileContent,
  onChangeFileProperties,
  onToggleFileFavorite,
}: {
  selection: Exclude<FilesSelection, 'structuredVocab' | 'structuredVocabShapes' | 'structuredVocabNamespaces' | 'structuredData'>
  detailOpen: boolean
  onToggleDetail: () => void
  onCloseDetail: () => void
  onOpenSelection?: (selection: FilesSelection) => void
  fileContentsByPath?: Record<string, StoredFileContent>
  filePropertiesByPath?: Record<string, FilePropertyState>
  isFileFavorite?: (path: string) => boolean
  onChangeFileContent?: (path: string, content: StoredFileContent) => void
  onChangeFileProperties?: (path: string, properties: FilePropertyState) => void
  onToggleFileFavorite?: (file: FileOpenSample) => void
}) {
  if (selection === 'folderRoot' || selection === 'folder') {
    return (
      <FolderMain
        folder={selection === 'folderRoot' ? filesRootFolderOpenSample : folderOpenSample}
        detailOpen={detailOpen}
        fileContentsByPath={fileContentsByPath}
        filePropertiesByPath={filePropertiesByPath}
        onChangeFileContent={onChangeFileContent}
        onChangeFileProperties={onChangeFileProperties}
        onToggleDetail={onToggleDetail}
        onOpenSelection={onOpenSelection}
        isFileFavorite={isFileFavorite}
        onToggleFileFavorite={onToggleFileFavorite}
      />
    )
  }

  if (selection === 'restricted') {
    return <ResourceDeniedMain />
  }

  return (
    <RegularFileSurface
      selection={selection}
      detailOpen={detailOpen}
      fileContentsByPath={fileContentsByPath}
      filePropertiesByPath={filePropertiesByPath}
      onChangeFileContent={onChangeFileContent}
      onChangeFileProperties={onChangeFileProperties}
      onToggleDetail={onToggleDetail}
      onCloseDetail={onCloseDetail}
      isFileFavorite={isFileFavorite}
      onToggleFileFavorite={onToggleFileFavorite}
    />
  )
}
