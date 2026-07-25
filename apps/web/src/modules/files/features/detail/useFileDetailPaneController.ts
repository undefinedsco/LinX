import { useCallback, useEffect, useRef } from 'react'

import { useFilesRouteBridge } from '../../app/FilesRouteContext'
import {
  copyFilesText,
  hasFilesSystemExternalOpen,
  openFilesExternalUri,
  openFilesSystemExternalUri,
} from '../../app/platform-actions'
import { clearStructuredSubjectRoute } from '../../app/route-state'
import { useFilesStore, type FileDetailTab } from '../../app/store'
import {
  filesFavoriteHooks,
  useFileDetail,
  useFilesFavoriteList,
} from '../../data/queries'
import { createContainerNodeId } from '../../domain/resource/tree-model'
import {
  planFileDetailFavoriteToggle,
  projectFileDetailControllerState,
  projectFileDetailFavoriteState,
  projectFileDetailStructuredReturnAction,
  shouldResetFileDetailHorizontalScroll,
} from './file-detail-pane-model'

export type { FileDetailTab }

export function useFileDetailPaneController() {
  const selectedFileId = useFilesStore((state) => state.selectedFileId)
  const selectedTreeNodeId = useFilesStore((state) => state.selectedTreeNodeId)
  const detailTab = useFilesStore((state) => state.detailTab)
  const setDetailTab = useFilesStore((state) => state.setDetailTab)
  const selectTreeNode = useFilesStore((state) => state.selectTreeNode)
  const structuredViewMode = useFilesStore((state) => state.structuredViewMode)
  const structuredSubjectReturnContext = useFilesStore((state) => state.structuredSubjectReturnContext)
  const returnToStructuredSubject = useFilesStore((state) => state.returnToStructuredSubject)
  const sidecarActionRequest = useFilesStore((state) => state.sidecarActionRequest)
  const consumeSidecarActionRequest = useFilesStore((state) => state.consumeSidecarActionRequest)
  const requestEditableFileSheetOpen = useFilesStore((state) => state.requestEditableFileSheetOpen)
  const metaSidebarOpen = useFilesStore((state) => state.metaSidebarOpen)
  const setMetaSidebarOpen = useFilesStore((state) => state.setMetaSidebarOpen)
  const filesRouteBridge = useFilesRouteBridge()
  const { data: file, isLoading, error, refetch } = useFileDetail(selectedFileId)
  const { data: favorites = [] } = useFilesFavoriteList({ sourceModule: 'files' })
  const detailScrollAreaRef = useRef<HTMLDivElement | null>(null)
  const previousSelectedFileIdRef = useRef(selectedFileId)

  const isFavorite = projectFileDetailFavoriteState({ file, favorites })

  useEffect(() => {
    if (previousSelectedFileIdRef.current === selectedFileId) return
    previousSelectedFileIdRef.current = selectedFileId
    setMetaSidebarOpen(false)
  }, [selectedFileId, setMetaSidebarOpen])

  useEffect(() => {
    if (!shouldResetFileDetailHorizontalScroll({ structuredViewMode })) return
    const scrollRoot = detailScrollAreaRef.current
    if (!scrollRoot) return
    scrollRoot.scrollLeft = 0
    const scrollViewport = scrollRoot.querySelector<HTMLElement>('[data-scroll-area-viewport="true"]')
    if (scrollViewport) scrollViewport.scrollLeft = 0
  }, [selectedFileId, structuredViewMode])

  const closeMetaDrawer = useCallback(() => {
    setMetaSidebarOpen(false)
  }, [setMetaSidebarOpen])

  const openMetaDrawer = useCallback(() => {
    setMetaSidebarOpen(true)
  }, [setMetaSidebarOpen])

  const handleCopyUri = useCallback(() => {
    if (!file) return
    void copyFilesText(file.uri)
  }, [file])

  const handleOpenUri = useCallback(() => {
    if (!file) return
    openFilesExternalUri(file.uri)
  }, [file])

  const handleSystemOpen = useCallback((href: string) => {
    openFilesSystemExternalUri(href)
  }, [])

  const handleEnterParentContainer = useCallback(() => {
    if (!file) return
    selectTreeNode(createContainerNodeId(file.parentUri), file.parentUri)
  }, [file, selectTreeNode])

  const handleReturnToStructuredSubject = useCallback(() => {
    if (filesRouteBridge) filesRouteBridge.clearStructuredSubjectRoute()
    else clearStructuredSubjectRoute()
    returnToStructuredSubject()
  }, [filesRouteBridge, returnToStructuredSubject])

  const handleToggleFavorite = useCallback(async () => {
    const plan = planFileDetailFavoriteToggle({
      file,
      isFavorite,
      selectedTreeNodeId,
    })
    if (!plan) return
    await filesFavoriteHooks.onStarredChange(plan.sourceModule, plan.sourceId, plan.starred, plan.metadata)
  }, [file, isFavorite, selectedTreeNodeId])

  const retryDetail = useCallback(() => {
    void refetch()
  }, [refetch])

  const detailState = projectFileDetailControllerState({
    selectedFileId,
    isLoading,
    error,
    file,
    detailTab,
    hasSystemOpen: hasFilesSystemExternalOpen(),
  })
  const structuredReturnAction = projectFileDetailStructuredReturnAction({
    file,
    returnContext: structuredSubjectReturnContext,
  })

  const consumeRequestedSidecarAction = useCallback((): 'access' | null => {
    if (!sidecarActionRequest || sidecarActionRequest.uri !== selectedFileId) return null
    const { action, uri } = sidecarActionRequest
    if (action === 'meta') {
      if (detailState.showMetaDrawer) openMetaDrawer()
      else requestEditableFileSheetOpen(uri)
    }
    consumeSidecarActionRequest(uri, action)
    return action === 'access' ? 'access' : null
  }, [
    consumeSidecarActionRequest,
    detailState.showMetaDrawer,
    openMetaDrawer,
    requestEditableFileSheetOpen,
    selectedFileId,
    sidecarActionRequest,
  ])

  return {
    activeDetailTab: detailState.activeDetailTab,
    closeMetaDrawer,
    consumeRequestedSidecarAction,
    detailScrollAreaRef,
    emptyState: detailState.emptyState,
    file,
    handleCopyUri,
    handleEnterParentContainer,
    handleOpenUri,
    handleReturnToStructuredSubject,
    handleSystemOpen,
    handleToggleFavorite,
    isFavorite,
    metaDrawerOpen: metaSidebarOpen,
    openMetaDrawer,
    resourceActions: detailState.resourceActions,
    isLoading,
    retryDetail,
    selectedFileId,
    setDetailTab,
    showHeadSidecarActions: detailState.showHeadSidecarActions,
    showMetaDrawer: detailState.showMetaDrawer,
    showSourceLinkedDrawerMetadata: detailState.showSourceLinkedDrawerMetadata,
    showTabs: detailState.showTabs,
    sidecarOwnerTarget: detailState.sidecarOwnerTarget,
    structuredReturnAction,
    sidecarActionRequest,
  }
}
