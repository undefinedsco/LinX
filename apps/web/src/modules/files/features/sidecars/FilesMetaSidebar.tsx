import { useFilesStore } from '../../app/store'
import { hasFilesSystemExternalOpen } from '../../app/platform-actions'
import { useFileDetail } from '../../data/queries'
import { projectFileDetailControllerState } from '../detail/file-detail-pane-model'
import { FileDrawerMetadata, SourceLinkedCardDrawerMetadata } from '../detail/FileDetailMetadataPanels'
import { ResourceMetaDrawer } from './ResourceSidecars'

export function FilesMetaSidebar() {
  const selectedFileId = useFilesStore((state) => state.selectedFileId)
  const detailTab = useFilesStore((state) => state.detailTab)
  const setMetaSidebarOpen = useFilesStore((state) => state.setMetaSidebarOpen)
  const { data: file, isLoading, error } = useFileDetail(selectedFileId)
  const detailState = projectFileDetailControllerState({
    selectedFileId,
    isLoading,
    error,
    file,
    detailTab,
    hasSystemOpen: hasFilesSystemExternalOpen(),
  })

  if (!file || !detailState.sidecarOwnerTarget) return null

  return (
    <ResourceMetaDrawer
      variant="embedded"
      file={file}
      target={detailState.sidecarOwnerTarget}
      open
      onClose={() => setMetaSidebarOpen(false)}
      showUserMetadata={!detailState.showFileDrawerMetadata}
    >
      {detailState.showSourceLinkedDrawerMetadata ? <SourceLinkedCardDrawerMetadata file={file} /> : null}
      {detailState.showFileDrawerMetadata ? <FileDrawerMetadata file={file} /> : null}
    </ResourceMetaDrawer>
  )
}
