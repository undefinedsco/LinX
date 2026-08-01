import { useRef } from 'react'

import {
  Dialog,
  DialogContent,
} from '@/components/ui/dialog'
import type { FilesDetail } from '../../domain/resource/resource-model'
import { FileEditorSurface, type FileEditorSurfaceHandle, type FileEditorSourceLinkedDescriptor } from './FileEditorSurface'

export function DocumentEditorModal({
  file,
  open,
  onOpenChange,
  sourceLinkedDescriptor,
  sourceLinkedDescriptorUri,
  stagedSourceText,
}: {
  file: FilesDetail
  open: boolean
  onOpenChange: (open: boolean) => void
  sourceLinkedDescriptor?: FileEditorSourceLinkedDescriptor | null
  sourceLinkedDescriptorUri?: string
  stagedSourceText?: string | null
}) {
  const surfaceRef = useRef<FileEditorSurfaceHandle>(null)

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => { if (!nextOpen) surfaceRef.current?.requestClose() }}>
      <DialogContent
        data-document-editor-modal="true"
        className="flex max-h-[92vh] w-[min(1120px,calc(100vw-32px))] max-w-none flex-col gap-0 overflow-hidden rounded-xl border-border/40 p-0 shadow-2xl"
      >
        <FileEditorSurface
          ref={surfaceRef}
          file={file}
          open={open}
          variant="modal"
          sourceLinkedDescriptor={sourceLinkedDescriptor}
          sourceLinkedDescriptorUri={sourceLinkedDescriptorUri}
          stagedSourceText={stagedSourceText}
          onExited={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  )
}
