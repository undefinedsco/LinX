import { RawTextBlock } from '../../ui/FileDetailPreviewPrimitives'
import { projectStructuredProjectionRawViewChrome } from './structured-projection-raw-view-model'

export function StructuredProjectionRawView({ text }: { text: string | null }) {
  const chrome = projectStructuredProjectionRawViewChrome()

  return (
    <div className="space-y-2">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-xs font-medium text-foreground">{chrome.heading}</h3>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {chrome.description}
          </p>
        </div>
      </div>
      <RawTextBlock text={text} />
    </div>
  )
}
