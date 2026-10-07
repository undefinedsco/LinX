import { useCallback, useMemo, useState } from 'react'

import { resolveFilesResourceSidecars, resolveFilesSidecarOwnerTarget } from '../../domain/resource/resource-semantics'
import type { ResourceSidecarActionTarget } from './useAccessPolicyDialogController'

export function useResourceSidecarActionsController(file: ResourceSidecarActionTarget) {
  const [accessOpen, setAccessOpen] = useState(false)
  const ownerTarget = useMemo(() => resolveFilesSidecarOwnerTarget(file), [file])
  const sidecars = useMemo(() => resolveFilesResourceSidecars(ownerTarget), [ownerTarget])

  const openAccessDialog = useCallback(() => {
    setAccessOpen(true)
  }, [])

  const closeAccessDialog = useCallback(() => {
    setAccessOpen(false)
  }, [])

  const setAccessDialogOpen = useCallback((open: boolean) => {
    setAccessOpen(open)
  }, [])

  return {
    accessOpen,
    ownerTarget,
    sidecars,
    openAccessDialog,
    closeAccessDialog,
    setAccessDialogOpen,
  }
}
