import { useCallback, useEffect, useState, type RefObject } from 'react'

import { copyFilesText, openFilesExternalUri } from '../../app/platform-actions'
import { useFilesRouteBridge } from '../../app/FilesRouteContext'
import { createFilesStructuredSubjectRouteState, pushStructuredSubjectRoute } from '../../app/route-state'
import { useFilesStore } from '../../app/store'
import type { FilesDetail } from '../../domain/resource/resource-model'
import type { StructuredResourceViewMode, StructuredSortDirection } from '../../domain/structured/structured-view-metadata'
import type { StructuredTableProjection } from '../../domain/structured/structured-table'
import {
  deriveStructuredSubjectPeekFacts,
  type StructuredSubjectPeekKind,
  type StructuredSubjectPeek,
} from '../../domain/structured/structured-subject-peek'
import {
  projectStructuredAlternativeSubjectOpenRequest,
  projectStructuredScrollRestorationTargetSignature,
  resolveStructuredSamePodSourceResourceUri,
  type StructuredSubjectOpenOptions,
} from './structured-subject-navigation-model'

export function useStructuredSubjectNavigationController({
  file,
  viewportRef,
  lastScrollTopRef,
  projection,
  tableProjection,
  effectiveViewProjection,
  viewMode,
  effectiveClassScope,
  structuredSearchText,
  structuredSortKey,
  structuredSortDirection,
  hiddenPredicates,
  kanbanGroupPredicate,
}: {
  file: Pick<FilesDetail, 'uri'>
  viewportRef: RefObject<HTMLDivElement | null>
  lastScrollTopRef: { current: number }
  projection: StructuredTableProjection
  tableProjection: StructuredTableProjection
  effectiveViewProjection: StructuredTableProjection
  viewMode: StructuredResourceViewMode
  effectiveClassScope: string | null
  structuredSearchText: string
  structuredSortKey: string | null
  structuredSortDirection: StructuredSortDirection
  hiddenPredicates: Set<string>
  kanbanGroupPredicate: string | null
}) {
  const filesRouteBridge = useFilesRouteBridge()
  const openStructuredSubjectResource = useFilesStore((state) => state.openStructuredSubjectResource)
  const scrollRestoration = useFilesStore((state) => state.structuredScrollRestoration)
  const clearStructuredScrollRestoration = useFilesStore((state) => state.clearStructuredScrollRestoration)
  const [subjectPeek, setSubjectPeek] = useState<StructuredSubjectPeek>(null)

  const recordStructuredViewportScrollTop = useCallback(() => {
    const scrollTop = viewportRef.current?.scrollTop
    if (scrollTop !== undefined) lastScrollTopRef.current = scrollTop
  }, [lastScrollTopRef, viewportRef])

  const currentStructuredScrollTop = useCallback(() => {
    const currentScrollTop = viewportRef.current?.scrollTop
    return currentScrollTop && currentScrollTop > 0 ? currentScrollTop : lastScrollTopRef.current
  }, [lastScrollTopRef, viewportRef])

  const pushSubjectRoute = useCallback((
    subject: string,
    targetUri: string,
    scrollTop = currentStructuredScrollTop(),
    rowIndex: number | null = null,
  ) => {
    const route = createFilesStructuredSubjectRouteState({
      documentUri: file.uri,
      subject,
      targetUri,
      scrollTop,
      rowIndex,
      viewMode,
      classScope: effectiveClassScope,
      searchText: structuredSearchText,
      sortKey: structuredSortKey,
      sortDirection: structuredSortDirection,
      hiddenPredicates: Array.from(hiddenPredicates),
      kanbanGroupPredicate,
    })
    if (filesRouteBridge) filesRouteBridge.pushStructuredSubjectRoute(route)
    else pushStructuredSubjectRoute(route)
  }, [
    currentStructuredScrollTop,
    effectiveClassScope,
    file.uri,
    filesRouteBridge,
    hiddenPredicates,
    kanbanGroupPredicate,
    structuredSearchText,
    structuredSortDirection,
    structuredSortKey,
    viewMode,
  ])

  const navigateStructuredSubject = useCallback((
    subject: string,
    targetUri: string,
    rowIndex: number | null = null,
    capturedScrollTop?: number,
  ) => {
    const scrollTop = capturedScrollTop ?? currentStructuredScrollTop()
    pushSubjectRoute(subject, targetUri, scrollTop, rowIndex)
    openStructuredSubjectResource({
      documentUri: file.uri,
      subject,
      targetUri,
      scrollTop,
      rowIndex,
    })
    setSubjectPeek(null)
  }, [currentStructuredScrollTop, file.uri, openStructuredSubjectResource, pushSubjectRoute])

  const openSubjectPeek = useCallback((
    subject: string,
    targetUri: string,
    kind: StructuredSubjectPeekKind,
    options?: StructuredSubjectOpenOptions,
  ) => {
    if (options?.navigate) {
      navigateStructuredSubject(subject, targetUri, options.rowIndex ?? null, options.scrollTop)
      return
    }
    setSubjectPeek({
      subject,
      targetUri,
      kind,
      rowIndex: options?.rowIndex ?? null,
      scrollTop: options?.scrollTop ?? currentStructuredScrollTop(),
      ...deriveStructuredSubjectPeekFacts({
        projection,
        visibleProjection: viewMode === 'table' ? tableProjection : effectiveViewProjection,
        subject,
      }),
    })
  }, [currentStructuredScrollTop, effectiveViewProjection, navigateStructuredSubject, projection, tableProjection, viewMode])

  const openAlternativeViewSubject = useCallback((subject: string, options?: StructuredSubjectOpenOptions) => {
    const openRequest = projectStructuredAlternativeSubjectOpenRequest({
      documentUri: file.uri,
      options,
      projection: effectiveViewProjection,
      subject,
    })
    if (!openRequest) return
    openSubjectPeek(
      openRequest.subject,
      openRequest.targetUri,
      openRequest.kind,
      openRequest.options,
    )
  }, [effectiveViewProjection, file.uri, openSubjectPeek])

  const clearSubjectPeek = useCallback(() => {
    setSubjectPeek(null)
  }, [])

  const openPeekedSubjectResource = useCallback(() => {
    if (!subjectPeek) return
    if (subjectPeek.kind === 'external') {
      openFilesExternalUri(subjectPeek.targetUri)
      setSubjectPeek(null)
      return
    }
    const scrollTop = subjectPeek.scrollTop
    pushSubjectRoute(subjectPeek.subject, subjectPeek.targetUri, scrollTop, subjectPeek.rowIndex)
    openStructuredSubjectResource({
      documentUri: file.uri,
      subject: subjectPeek.subject,
      targetUri: subjectPeek.targetUri,
      scrollTop,
      rowIndex: subjectPeek.rowIndex,
    })
    setSubjectPeek(null)
  }, [file.uri, openStructuredSubjectResource, pushSubjectRoute, subjectPeek])

  const copyPeekedExternalIri = useCallback(() => {
    if (subjectPeek?.kind !== 'external') return
    void copyFilesText(subjectPeek.targetUri)
  }, [subjectPeek])

  const openPeekedSource = useCallback(() => {
    if (!subjectPeek?.source) return
    const sourceResourceUri = resolveStructuredSamePodSourceResourceUri(file.uri, subjectPeek.source)
    if (sourceResourceUri) {
      const scrollTop = currentStructuredScrollTop()
      pushSubjectRoute(subjectPeek.subject, sourceResourceUri, scrollTop, subjectPeek.rowIndex)
      openStructuredSubjectResource({
        documentUri: file.uri,
        subject: subjectPeek.subject,
        targetUri: sourceResourceUri,
        scrollTop,
        rowIndex: subjectPeek.rowIndex,
      })
      setSubjectPeek(null)
      return
    }
    openFilesExternalUri(subjectPeek.source)
    setSubjectPeek(null)
  }, [currentStructuredScrollTop, file.uri, openStructuredSubjectResource, pushSubjectRoute, subjectPeek])

  const scrollRestorationTargetSignature = projectStructuredScrollRestorationTargetSignature({
    documentUri: file.uri,
    scrollRestoration,
    tableProjection,
  })

  useEffect(() => {
    if (!scrollRestoration || scrollRestoration.documentUri !== file.uri) return
    const viewport = viewportRef.current
    if (!viewport) return
    const findFocusTarget = () => {
      const currentViewport = viewportRef.current
      if (!currentViewport) return null
      const subjectButton = Array.from(currentViewport.querySelectorAll<HTMLElement>('[data-structured-subject-open]'))
        .find((element) => element.dataset.structuredSubjectOpen === scrollRestoration.subject)
      const rowButton = scrollRestoration.rowIndex !== null && scrollRestoration.rowIndex !== undefined
        ? Array.from(currentViewport.querySelectorAll<HTMLElement>('[data-structured-row-index]'))
            .find((element) => element.dataset.structuredRowIndex === String(scrollRestoration.rowIndex))
        : null
      return subjectButton ?? rowButton ?? null
    }
    const focusTarget = findFocusTarget()
    if (!focusTarget) return

    viewport.scrollTop = scrollRestoration.scrollTop
    const restoreFocus = () => {
      const currentViewport = viewportRef.current
      const currentFocusTarget = findFocusTarget()
      if (!currentViewport?.isConnected || !currentFocusTarget?.isConnected) return false
      currentViewport.scrollTop = scrollRestoration.scrollTop
      currentFocusTarget.focus({ preventScroll: true })
      if (document.activeElement !== currentFocusTarget) currentFocusTarget.focus()
      return document.activeElement === currentFocusTarget
    }
    clearStructuredScrollRestoration()
    window.setTimeout(() => {
      restoreFocus()
      window.setTimeout(() => {
        restoreFocus()
      }, 32)
    }, 0)
  }, [clearStructuredScrollRestoration, file.uri, scrollRestoration, scrollRestorationTargetSignature, viewportRef])

  return {
    subjectPeek,
    clearSubjectPeek,
    recordStructuredViewportScrollTop,
    openSubjectPeek,
    openAlternativeViewSubject,
    openPeekedSubjectResource,
    copyPeekedExternalIri,
    openPeekedSource,
  }
}
