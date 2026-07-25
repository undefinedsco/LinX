import { lazy, Suspense, useEffect, useMemo } from 'react'
import type { MicroAppLayoutConfig } from '@/modules/layout/micro-app-registry'
import { useFilesStore } from './store'

const FilesMetaSidebar = lazy(() =>
  import('../features/sidecars/FilesMetaSidebar').then((mod) => ({ default: mod.FilesMetaSidebar })),
)

const FILES_TREE_WIDTH_MIN = 232
const FILES_TREE_WIDTH_MAX = 360
const FILES_TREE_WIDTH_DEFAULT = 240

// The desktop shell persists the resizable layout through react-resizable-panels'
// useDefaultLayout (see PrimaryLayout, id `linx-primary-layout-files-desktop`).
// Read the persisted tree width back so the configured default matches the width
// the user last chose; fall back to the default when nothing is stored yet.
function readPersistedTreeWidth(): number {
  if (typeof window === 'undefined') return FILES_TREE_WIDTH_DEFAULT
  try {
    const storageKey = 'react-resizable-panels:linx-primary-layout-files-desktop:list:main'
    const stored = window.localStorage.getItem(storageKey)
    if (!stored) return FILES_TREE_WIDTH_DEFAULT
    const layout = JSON.parse(stored) as { list?: unknown }
    const width = typeof layout.list === 'number' ? layout.list : Number.NaN
    if (Number.isNaN(width)) return FILES_TREE_WIDTH_DEFAULT
    return Math.min(FILES_TREE_WIDTH_MAX, Math.max(FILES_TREE_WIDTH_MIN, Math.round(width)))
  } catch {
    return FILES_TREE_WIDTH_DEFAULT
  }
}

export function FilesLayoutConfigBridge({
  onConfigChange,
}: {
  onConfigChange: (config: MicroAppLayoutConfig | undefined) => void
}) {
  const metaSidebarOpen = useFilesStore((state) => state.metaSidebarOpen)
  const config = useMemo<MicroAppLayoutConfig>(() => ({
    listPanel: {
      defaultWidth: readPersistedTreeWidth(),
      minWidth: FILES_TREE_WIDTH_MIN,
      maxWidth: FILES_TREE_WIDTH_MAX,
    },
    rightSidebar: metaSidebarOpen
      ? (
          <Suspense fallback={null}>
            <FilesMetaSidebar />
          </Suspense>
        )
      : null,
    rightSidebarWidth: 320,
  }), [metaSidebarOpen])

  useEffect(() => {
    onConfigChange(config)
  }, [config, onConfigChange])

  return null
}
