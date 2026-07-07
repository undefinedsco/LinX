import { ExternalLink } from 'lucide-react'

import { Button } from '@/components/ui/button'

import type { FilesDetail, FilesEntry } from '../../domain/resource/resource-model'
import { ResourceMetaDrawer, ResourceSidecarActions } from '../sidecars/ResourceSidecars'
import { useFolderChildPreviewController } from './useFolderChildPreviewController'

export function FolderChildPreview({
  child,
  childCount,
  file,
  onOpen,
}: {
  child: FilesEntry | null
  childCount: number
  file: FilesDetail
  onOpen?: () => void
}) {
  const preview = useFolderChildPreviewController({ child, childCount, file })

  return (
    <aside className="border-l border-border/30 bg-transparent py-1 pl-3 pr-1" aria-label={preview.chrome.ariaLabel}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-foreground/80">{preview.heading}</p>
        {child && onOpen ? (
          <div className="flex items-center gap-1">
            <Button
              size="icon"
              variant="ghost"
              className="h-6 w-6"
              aria-label={preview.chrome.openSelectedLabel}
              title={preview.chrome.openSelectedLabel}
              onClick={onOpen}
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </Button>
            <ResourceSidecarActions file={child} compact onMeta={preview.openMetaDrawer} />
          </div>
        ) : null}
      </div>
      {preview.childDetail && preview.childSidecarOwnerTarget ? (
        <ResourceMetaDrawer
          file={preview.childDetail}
          target={preview.childSidecarOwnerTarget}
          open={preview.metaDrawerOpen}
          onClose={preview.closeMetaDrawer}
        />
      ) : null}
      {child ? (
        <div className="mt-3 border-t border-border/30 pt-2">
          <h3 className="truncate text-sm font-semibold text-foreground" title={child.name}>{child.name}</h3>
          {preview.childSubtitle ? (
            <p className="mt-1 truncate text-[11px] text-muted-foreground" title={preview.childSubtitle}>{preview.childSubtitle}</p>
          ) : null}
          {preview.childSummary ? (
            <p className="mt-2 text-xs leading-5 text-foreground/75">{preview.childSummary}</p>
          ) : null}
        </div>
      ) : null}
      <div className="mt-2 space-y-1">
        {preview.rows.map(([label, value]) => (
          <div key={label} className="grid grid-cols-[64px_minmax(0,1fr)] gap-2 text-[11px]">
            <span className="text-muted-foreground">{label}</span>
            <span className="truncate text-foreground/80" title={value}>{value}</span>
          </div>
        ))}
      </div>
    </aside>
  )
}
