import {
  FilePlus2,
  FolderPlus,
  FolderUp,
  Globe2,
  Plus,
  Upload,
  type LucideIcon,
} from 'lucide-react'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { FilesAddActionModel } from '../../domain/list/files-add-menu-model'
import type { FilesEntry } from '../../domain/resource/resource-model'
import { FilesOperationSheet } from '../../ui/FilesOperationSheet'
import { SourceIngestForm } from '../ingest/SourceIngestAction'
import { useFilesAddMenuController } from './useFilesAddMenuController'

const actionIcons = {
  document: FilePlus2,
  folder: FolderPlus,
  'upload-file': Upload,
  'upload-folder': FolderUp,
  web: Globe2,
} satisfies Record<FilesAddActionModel['iconKind'], LucideIcon>

export function FilesAddMenu({
  containerUri,
  entries,
}: {
  containerUri: string | null
  entries: FilesEntry[]
}) {
  const addMenu = useFilesAddMenuController({ containerUri, entries })

  return (
    <>
      {addMenu.ingest.feedback.success ? (
        <p className="sr-only" aria-live="polite">{addMenu.ingest.feedback.success.message}</p>
      ) : null}
      <input
        ref={addMenu.folderUpload.uploadInputRef}
        type="file"
        className="sr-only"
        aria-label="选择上传文件"
        multiple
        onChange={(event) => void addMenu.folderUpload.uploadPickedFiles(event)}
      />
      <input
        ref={(node) => {
          addMenu.folderUpload.uploadFolderInputRef.current = node
          node?.setAttribute('webkitdirectory', '')
          node?.setAttribute('directory', '')
        }}
        type="file"
        className="sr-only"
        aria-label="选择上传文件夹"
        multiple
        onChange={(event) => void addMenu.folderUpload.uploadPickedFolder(event)}
      />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={addMenu.menu.triggerLabel}
            title={addMenu.menu.triggerLabel}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-muted/80 hover:text-foreground"
          >
            <Plus strokeWidth={1.5} className="h-3.5 w-3.5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-52">
          <DropdownMenuLabel className="max-w-72 truncate text-[11px] font-normal text-muted-foreground">
            {addMenu.menu.destinationLabel}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          {addMenu.menu.actions.map((action, index) => {
            const Icon = actionIcons[action.iconKind]
            return (
              <div key={action.id}>
                {(index === 2 || index === 4) ? <DropdownMenuSeparator /> : null}
                <DropdownMenuItem
                  disabled={action.disabled || addMenu.folderUpload.uploadPending}
                  onSelect={() => addMenu.runAction(action.id)}
                >
                  <Icon className="mr-2 h-3.5 w-3.5" strokeWidth={1.5} />
                  {action.label}
                </DropdownMenuItem>
              </div>
            )
          })}
        </DropdownMenuContent>
      </DropdownMenu>

      <FilesOperationSheet
        open={Boolean(addMenu.operationSheet)}
        title={addMenu.operationSheet?.title ?? ''}
        description={addMenu.operationSheet?.description ?? ''}
        input={addMenu.operationSheet?.requiresInput ? {
          label: addMenu.operationSheet.inputLabel ?? '',
          value: addMenu.operationValue,
          onValueChange: addMenu.setOperationValue,
        } : null}
        confirmLabel={addMenu.operationSheet?.confirmLabel ?? '创建'}
        confirmDisabled={addMenu.operationConfirmDisabled}
        validationMessage={addMenu.operationValidationMessage}
        onClose={addMenu.closeOperation}
        onConfirm={() => void addMenu.confirmOperation()}
      />

      <Dialog open={addMenu.ingest.open} onOpenChange={addMenu.ingest.setOpen}>
        <DialogContent className="w-[min(440px,calc(100vw-32px))] gap-4 rounded-xl border-border/40 p-5">
          <DialogHeader>
            <DialogTitle>{addMenu.ingest.chrome.triggerLabel}</DialogTitle>
            <DialogDescription className="truncate" title={addMenu.ingest.chrome.containerLabel}>
              {addMenu.ingest.chrome.containerLabel}
            </DialogDescription>
          </DialogHeader>
          <SourceIngestForm ingest={addMenu.ingest} />
        </DialogContent>
      </Dialog>
    </>
  )
}
