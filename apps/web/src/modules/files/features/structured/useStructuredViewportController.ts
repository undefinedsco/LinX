import { useCallback, useEffect, useRef, type UIEvent } from 'react'

import type { StructuredResourceViewMode } from '../../domain/structured/structured-view-metadata'

export type StructuredViewportChromeModel = {
  viewport: {
    ariaLabel: string
  }
}

export function projectStructuredViewportChrome(): StructuredViewportChromeModel {
  return {
    viewport: {
      ariaLabel: 'Structured resource viewport',
    },
  }
}

export function useStructuredViewportController({
  fileUri,
  viewMode,
}: {
  fileUri: string
  viewMode: StructuredResourceViewMode
}) {
  const viewportRef = useRef<HTMLDivElement | null>(null)
  const lastScrollTopRef = useRef(0)

  useEffect(() => {
    const viewport = viewportRef.current
    if (viewport) viewport.scrollLeft = 0
  }, [fileUri, viewMode])

  const recordStructuredViewportScrollTop = useCallback(() => {
    const scrollTop = viewportRef.current?.scrollTop
    if (scrollTop !== undefined) lastScrollTopRef.current = scrollTop
  }, [])

  const handleStructuredViewportScroll = useCallback((event: UIEvent<HTMLDivElement>) => {
    lastScrollTopRef.current = event.currentTarget.scrollTop
  }, [])

  return {
    chrome: projectStructuredViewportChrome(),
    handleStructuredViewportScroll,
    lastScrollTopRef,
    recordStructuredViewportScrollTop,
    viewportRef,
  }
}
