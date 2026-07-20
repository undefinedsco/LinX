import { FileText } from 'lucide-react'

import { Button } from '@/components/ui/button'

import {
  getFilesEntryOpenMode,
} from '../../domain/resource/resource-semantics'
import type { FilesDetail } from '../../domain/resource/resource-model'
import { LockedVocabTablePreview } from '../structured/LockedVocabTablePreview'
import { StructuredResourcePreview } from '../structured/StructuredTablePreview'
import { DocumentEditorModal } from '../editor/DocumentEditorModal'
import { SourceLinkedCardPreview } from './FileDetailSourceLinkedCardPreview'
import { ModeCard, RawTextBlock } from '../../ui/FileDetailPreviewPrimitives'
import { FolderDetailPreview } from '../folder/FolderDetailPreview'
import { useEditableFilePreviewController } from './useEditableFilePreviewController'
import { useAuthenticatedImagePreviewController } from './useAuthenticatedImagePreviewController'
import {
  projectAuthenticatedImagePreviewRenderState,
  projectEditableFilePreviewModel,
  projectFileDetailLineageModel,
  projectFileDetailSidecarPreviewModel,
  projectReadonlyFilePreviewModel,
  type MediaFilePreviewModel,
} from './file-detail-preview-model'

function EditableFilePreview({
  file,
  onOpenSheet,
}: {
  file: FilesDetail
  onOpenSheet?: () => void
}) {
  const {
    handlePreviewKeyDown,
    openSheet,
    setSheetOpen,
    sheetOpen,
  } = useEditableFilePreviewController({
    fileUri: file.uri,
    onOpenSheet,
  })
  const editablePreview = projectEditableFilePreviewModel(file)

  return (
    <div
      aria-label="可编辑文件预览"
      className="flex min-h-full items-start justify-center px-6 py-8 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      tabIndex={0}
      onDoubleClick={openSheet}
      onKeyDown={handlePreviewKeyDown}
    >
      <section className="w-full max-w-xl">
        <div className="flex items-start gap-3 border-b border-border/35 pb-4">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted/60 text-muted-foreground">
            <FileText className="h-4 w-4" aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-base font-semibold text-foreground" title={editablePreview.title}>{editablePreview.title}</h2>
            <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
              {editablePreview.facts.map((fact, index) => (
                <span key={fact} className="inline-flex items-center gap-2">
                  {index > 0 ? <span className="text-muted-foreground/50" aria-hidden="true">·</span> : null}
                  <span>{fact}</span>
                </span>
              ))}
            </p>
          </div>
          <Button size="sm" className="h-7 shrink-0 text-xs" onClick={openSheet}>
            {editablePreview.openLabel}
          </Button>
        </div>
        <div className="mt-4 space-y-3">
          <RawTextBlock text={file.previewText} />
          {!file.previewText ? (
            <ModeCard title="正文暂不可用" description="可以打开文件详情继续编辑，或稍后重试读取。" />
          ) : null}
          <dl className="grid gap-2 text-xs">
            {editablePreview.rows.filter((row) => row.label !== '内容').map((row) => (
              <div key={row.label} className="grid grid-cols-[64px_minmax(0,1fr)] gap-3">
                <dt className="text-muted-foreground">{row.label}</dt>
                <dd
                  className={row.kind === 'uri' ? 'truncate text-foreground/80' : 'text-foreground/80'}
                  title={row.kind === 'uri' ? row.value : undefined}
                >
                  {row.value}
                </dd>
              </div>
            ))}
          </dl>
        </div>
        <DocumentEditorModal
          file={file}
          open={sheetOpen}
          onOpenChange={setSheetOpen}
        />
      </section>
    </div>
  )
}

function SidecarPreview({ file }: { file: FilesDetail }) {
  const sidecarPreview = projectFileDetailSidecarPreviewModel(file)
  return (
    <div className="p-4 space-y-3">
      <ModeCard
        title={sidecarPreview.title}
        description={sidecarPreview.description}
      >
        {sidecarPreview.showRows ? (
          <div className="space-y-1 text-[11px]">
            {sidecarPreview.rows.map((row) => (
              <p key={row.label}>
                <span className="text-muted-foreground">{row.label}</span>{' '}
                <span className={row.kind === 'provider' ? 'uppercase text-foreground/80' : 'break-all text-foreground/80'}>{row.value}</span>
              </p>
            ))}
          </div>
        ) : null}
        {sidecarPreview.accessNotice ? (
          <div className="mt-3 flex items-center gap-2 rounded-md border border-border/40 bg-background/70 px-3 py-2">
            <span className="min-w-0 flex-1 text-[11px] text-muted-foreground">{sidecarPreview.accessNotice}</span>
          </div>
        ) : null}
      </ModeCard>
      <RawTextBlock text={sidecarPreview.rawText} />
    </div>
  )
}

function ReadonlyPreview({ file }: { file: FilesDetail }) {
  const readonlyPreview = projectReadonlyFilePreviewModel(file)

  if (readonlyPreview.kind === 'raw-text') {
    return (
      <div className="p-4">
        <RawTextBlock text={readonlyPreview.rawText} />
      </div>
    )
  }

  if (readonlyPreview.kind !== 'unsupported') {
    return <AuthenticatedMediaPreview preview={readonlyPreview} />
  }

  return (
    <div className="p-6 text-center text-sm text-muted-foreground">
      <FileText className="w-8 h-8 mx-auto mb-2 text-muted-foreground/40" />
      <p>{readonlyPreview.reason}</p>
      <p className="text-xs mt-1 text-muted-foreground/60">{readonlyPreview.mimeTypeLabel}</p>
    </div>
  )
}

function AuthenticatedMediaPreview({ preview }: { preview: MediaFilePreviewModel }) {
  const imagePreview = useAuthenticatedImagePreviewController({
    enabled: true,
    uri: preview.uri,
  })
  const renderState = projectAuthenticatedImagePreviewRenderState(preview, imagePreview)

  if (renderState.kind === 'loading') {
    return (
      <div className="flex h-full min-h-[320px] items-center justify-center bg-muted/15 p-4 text-sm text-muted-foreground">
        {renderState.message}
      </div>
    )
  }

  if (renderState.kind === 'unavailable') {
    return (
      <div className="p-6 text-center text-sm text-muted-foreground">
        <FileText className="w-8 h-8 mx-auto mb-2 text-muted-foreground/40" />
        <p>{renderState.reason}</p>
        <p className="text-xs mt-1 text-muted-foreground/60">{renderState.mimeTypeLabel}</p>
      </div>
    )
  }

  if (preview.kind === 'image') return (
    <div className="flex h-full min-h-[320px] items-center justify-center bg-muted/15 p-4">
      <img
        src={renderState.objectUrl}
        alt={renderState.alt}
        className="max-h-[70vh] max-w-full rounded-md border border-border/30 bg-background object-contain shadow-sm"
      />
    </div>
  )

  if (preview.kind === 'document') return (
    <iframe
      aria-label={`${preview.alt} 预览`}
      className="h-full min-h-[70vh] w-full border-0 bg-background"
      src={renderState.objectUrl}
      title={preview.alt}
    />
  )

  if (preview.kind === 'audio') return (
    <div className="flex h-full min-h-[240px] items-center justify-center bg-muted/15 p-6">
      <audio aria-label={`${preview.alt} 预览`} className="w-full max-w-xl" controls src={renderState.objectUrl} />
    </div>
  )

  return (
    <div className="flex h-full min-h-[320px] items-center justify-center bg-black/95 p-4">
      <video aria-label={`${preview.alt} 预览`} className="max-h-[75vh] max-w-full" controls src={renderState.objectUrl} />
    </div>
  )
}

export function FileDetailPreview({
  file,
  onOpenEditableFileSheet,
}: {
  file: FilesDetail
  onOpenEditableFileSheet?: () => void
}) {
  const openMode = getFilesEntryOpenMode(file)

  switch (openMode) {
    case 'structured-data-table':
      return <StructuredResourcePreview file={file} />
    case 'locked-vocab-table':
      return <LockedVocabTablePreview file={file} />
    case 'source-linked-card-preview':
      return <SourceLinkedCardPreview file={file} />
    case 'editable-file-sheet':
      return <EditableFilePreview file={file} onOpenSheet={onOpenEditableFileSheet} />
    case 'sidecar-detail':
      return <SidecarPreview file={file} />
    case 'readonly-preview':
      return <ReadonlyPreview file={file} />
    case 'browse-container':
      return <FolderDetailPreview file={file} />
  }
}

export function FileDetailLineage({ file }: { file: FilesDetail }) {
  const lineage = projectFileDetailLineageModel(file)

  return (
    <div className="p-4 space-y-4">
      <div className="space-y-2">
        <p className="text-xs text-muted-foreground font-medium">{lineage.semanticSection.label}</p>
        <span className="text-[10px] px-2 py-0.5 rounded font-medium bg-muted text-muted-foreground">
          {lineage.semanticSection.value}
        </span>
      </div>
      {lineage.rows.map((row) => (
        <div key={row.label} className="space-y-2">
          <p className="text-xs text-muted-foreground font-medium">{row.label}</p>
          <p className={row.kind === 'policy' ? 'text-xs text-foreground/80 leading-relaxed' : 'text-xs text-foreground/80 break-all'}>{row.value}</p>
        </div>
      ))}
    </div>
  )
}
