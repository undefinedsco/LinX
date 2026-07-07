import { ExternalLink, FileText, GitBranch, Pencil, RefreshCw } from 'lucide-react'

import { Button } from '@/components/ui/button'

import type { FilesDetail } from '../../domain/resource/resource-model'
import { FileEditorSheet } from '../editor/FileEditorSheet'
import {
  DetailRows,
  ModeCard,
  RawTextBlock,
} from '../../ui/FileDetailPreviewPrimitives'
import { RichTextFileEditor } from '../../ui/RichTextFileEditor'
import type { SourceLinkedCardPrimaryActionIcon } from './source-linked-card-preview-model'
import { useSourceLinkedCardPreviewController } from './useSourceLinkedCardPreviewController'

function SourceLinkedCardActionIcon({ icon }: { icon: SourceLinkedCardPrimaryActionIcon }) {
  switch (icon) {
    case 'external-link':
      return <ExternalLink className="h-3.5 w-3.5" />
    case 'file-text':
      return <FileText className="h-3.5 w-3.5" />
    case 'refresh':
      return <RefreshCw className="h-3.5 w-3.5" />
    case 'edit':
      return <Pencil className="h-3.5 w-3.5" />
    case 'branch':
      return <GitBranch className="h-3.5 w-3.5" />
  }
}

export function SourceLinkedCardPreview({ file }: { file: FilesDetail }) {
  const preview = useSourceLinkedCardPreviewController(file)
  const content = preview.content

  if (content.kind === 'unavailable') {
    return (
      <div className="p-4">
        <ModeCard
          title={content.title}
          description={content.description}
        >
          <RawTextBlock text={content.rawText} />
        </ModeCard>
      </div>
    )
  }

  return (
    <div className="space-y-3 p-4">
      <ModeCard
        title={content.title}
        description={content.description}
      >
        <div className="flex flex-wrap justify-end gap-1">
          {preview.primaryActions.map((action) => (
            <Button
              key={action.id}
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              aria-label={action.label}
              aria-describedby={action.describedByError && preview.actionError ? preview.actionError.id : undefined}
              title={action.label}
              disabled={action.disabled}
              onClick={() => void action.onSelect()}
            >
              <SourceLinkedCardActionIcon icon={action.icon} />
            </Button>
          ))}
        </div>
        {preview.actionError ? (
          <p
            id={preview.actionError.id}
            role="alert"
            className="mt-2 rounded-md border border-destructive/30 bg-destructive/10 px-2 py-1 text-[11px] leading-relaxed text-destructive"
          >
            {preview.actionError.message}
          </p>
        ) : null}
        <div className="mt-3">
          <RichTextFileEditor
            content={content.bodyRichEditorContent}
            warning={content.bodyRichTextWarning}
            editable={false}
            className="min-h-[220px] border-border/30 bg-background/70 shadow-none"
          />
        </div>
      </ModeCard>
      <div className="flex flex-wrap justify-between gap-2">
        <Button
          size="sm"
          variant="ghost"
          className="h-7 text-xs"
          aria-expanded={Boolean(preview.detailsPanel)}
          onClick={preview.toggleSourceDetails}
        >
          Ingest 与审批
        </Button>
        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={preview.openSheet}>
          编辑正文
        </Button>
      </div>
      {preview.detailsPanel ? (
        <ModeCard
          title={preview.detailsPanel.title}
          description={preview.detailsPanel.description}
        >
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <span className="inline-flex rounded bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
              {preview.detailsPanel.badgeLabel}
            </span>
            {preview.detailsPanel.hasPendingIngestRangeActions ? (
              <div className="flex flex-wrap items-center gap-1">
                {preview.ingestRangeActions.map((action) => (
                  <Button
                    key={action.id}
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs"
                    disabled={action.disabled}
                    onClick={() => void action.onSelect()}
                  >
                    {action.label}
                  </Button>
                ))}
              </div>
            ) : null}
          </div>
          <DetailRows rows={preview.detailsPanel.rows} />
          {preview.detailsPanel.stagedIngestContent ? (
            <div className="mt-3">
              <p className="mb-1 text-xs font-medium text-muted-foreground">待审批 Ingest 内容</p>
              <RawTextBlock text={preview.detailsPanel.stagedIngestContent} />
            </div>
          ) : null}
          <div className="mt-3">
            <RawTextBlock text={preview.detailsPanel.rawText} />
          </div>
        </ModeCard>
      ) : null}
      {preview.editorSheet ? (
        <FileEditorSheet
          file={preview.editorSheet.file}
          open={preview.editorSheet.open}
          onOpenChange={preview.setSheetOpen}
          sourceLinkedDescriptor={preview.editorSheet.descriptor}
          sourceLinkedDescriptorUri={preview.editorSheet.descriptorUri}
          stagedSourceText={preview.editorSheet.stagedSourceText}
        />
      ) : null}
    </div>
  )
}
