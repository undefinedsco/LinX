import { Download, FileText } from 'lucide-react'
import type { FileMessageBlock } from '../message-blocks'
import { safeExternalUrl } from './safe-url'

function formatFileSize(size?: number) {
  if (typeof size !== 'number' || !Number.isFinite(size) || size < 0) return null
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

export function FileBlock({ block }: { block: FileMessageBlock }) {
  const fileSize = formatFileSize(block.fileSize)
  const fileUrl = safeExternalUrl(block.fileUrl)
  if (!fileUrl) return null
  return (
    <a
      href={fileUrl}
      target="_blank"
      rel="noreferrer noopener"
      className="my-2 flex max-w-xl items-center gap-3 rounded-xl border border-border/60 bg-muted/20 px-3 py-3 transition-colors hover:bg-muted/40"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-background">
        <FileText className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-foreground">{block.fileName}</span>
        <span className="block text-xs text-muted-foreground">
          {[block.mimeType, fileSize].filter(Boolean).join(' · ') || '文件附件'}
        </span>
      </span>
      <Download className="h-4 w-4 shrink-0 text-muted-foreground" aria-label="打开文件" />
    </a>
  )
}
