import { useCallback, useMemo, useState } from 'react'

import { useToast } from '@/components/ui/use-toast'

import {
  useCopyFileResource,
  useDeleteFileResource,
  useMoveFileResource,
} from '../../data/queries'
import {
  canSubmitFilesListOperationSheet,
  createFilesListOperationState,
  projectFilesListOperationConfirmChrome,
  projectFilesListOperationOpened,
  projectFilesListOperationReset,
  projectFilesListOperationValuePatch,
  projectFilesListOperationDestination,
  projectFilesListOperationSheetModel,
  type FilesListOperation,
} from '../../domain/list/files-list-operation-model'
import type { FilesEntry } from '../../domain/resource/resource-model'

export function useFilesListOperationController({
  baseEntries,
  clearListSelection,
  replaceFileSelection,
  selectFile,
}: {
  baseEntries: FilesEntry[]
  clearListSelection: () => void
  replaceFileSelection: (uris: string[]) => void
  selectFile: (uri: string | null) => void
}) {
  const { toast } = useToast()
  const copyResource = useCopyFileResource()
  const moveResource = useMoveFileResource()
  const deleteResource = useDeleteFileResource()
  const [operationState, setOperationState] = useState(createFilesListOperationState)
  const operation = operationState.operation
  const operationValue = operationState.value

  const resetOperation = useCallback(() => {
    setOperationState(projectFilesListOperationReset())
  }, [])

  const setOperationValue = useCallback((value: string) => {
    setOperationState((current) => projectFilesListOperationValuePatch({
      current,
      value,
    }))
  }, [])

  const openOperationAfterMenuClose = useCallback((nextOperation: Exclude<FilesListOperation, null>, value?: string) => {
    let opened = false
    const openNext = () => {
      if (opened) return
      opened = true
      setOperationState(projectFilesListOperationOpened({
        operation: nextOperation,
        value,
        baseEntries,
      }))
    }
    window.setTimeout(() => {
      openNext()
    }, 0)
  }, [baseEntries])

  const openTransferContextFile = useCallback((file: FilesEntry, type: 'copy' | 'move') => {
    const nextOperation = { type, file } satisfies Exclude<FilesListOperation, null>
    openOperationAfterMenuClose(nextOperation)
  }, [openOperationAfterMenuClose])

  const openRenameContextFile = useCallback((file: FilesEntry) => {
    const nextOperation = { type: 'rename', file } satisfies Exclude<FilesListOperation, null>
    openOperationAfterMenuClose(nextOperation)
  }, [openOperationAfterMenuClose])

  const openDeleteFiles = useCallback((filesToDelete: FilesEntry[], options?: { defer?: boolean }) => {
    if (filesToDelete.length === 0) return
    const nextOperation = { type: 'delete', files: filesToDelete } satisfies Exclude<FilesListOperation, null>
    if (options?.defer) {
      openOperationAfterMenuClose(nextOperation)
      return
    }
    setOperationState(projectFilesListOperationOpened({
      operation: nextOperation,
      baseEntries,
    }))
  }, [baseEntries, openOperationAfterMenuClose])

  const operationDestination = useMemo(() => projectFilesListOperationDestination({
    operation,
    value: operationValue,
    baseEntries,
  }), [baseEntries, operation, operationValue])

  const operationValidationMessage = operationDestination.validationMessage

  const runDeleteFiles = useCallback(async (filesToDelete: FilesEntry[]) => {
    if (filesToDelete.length === 0) return
    try {
      for (const file of filesToDelete) {
        await deleteResource.mutateAsync(file.uri)
      }
      clearListSelection()
      resetOperation()
      toast({ description: filesToDelete.length > 1 ? `已删除 ${filesToDelete.length} 项` : '文件已删除' })
    } catch (error) {
      toast({
        description: `删除失败：${error instanceof Error ? error.message : '未知错误'}`,
        variant: 'destructive',
      })
    }
  }, [clearListSelection, deleteResource, resetOperation, toast])

  const confirmOperation = useCallback(async () => {
    if (!operation) return
    try {
      if (operation.type === 'delete') {
        await runDeleteFiles(operation.files)
        return
      }

      const destinationUri = operationDestination.destinationUri
      if (!destinationUri) return
      if (operation.type === 'rename') {
        await moveResource.mutateAsync({
          sourceUri: operation.file.uri,
          destinationUri,
        })
        replaceFileSelection([destinationUri])
        selectFile(destinationUri)
        resetOperation()
        toast({ description: '重命名已开始' })
        return
      }

      const input = {
        sourceUri: operation.file.uri,
        destinationUri,
      }
      if (operation.type === 'copy') {
        await copyResource.mutateAsync(input)
        resetOperation()
        toast({ description: '文件复制已开始' })
        return
      }
      await moveResource.mutateAsync(input)
      resetOperation()
      toast({ description: '文件移动已开始' })
    } catch (error) {
      toast({
        description: `${operation.type === 'delete' ? '删除' : operation.type === 'rename' ? '重命名' : operation.type === 'copy' ? '复制' : '移动'}失败：${error instanceof Error ? error.message : '未知错误'}`,
        variant: 'destructive',
      })
    }
  }, [
    copyResource,
    moveResource,
    operation,
    operationDestination.destinationUri,
    replaceFileSelection,
    resetOperation,
    runDeleteFiles,
    selectFile,
    toast,
  ])

  const operationPending = copyResource.isPending || moveResource.isPending || deleteResource.isPending

  const closeOperationSheet = useCallback(() => {
    if (operationPending) return
    resetOperation()
  }, [operationPending, resetOperation])

  const operationSheetModel = useMemo(() => projectFilesListOperationSheetModel(operation), [operation])
  const operationConfirmChrome = operationSheetModel
    ? projectFilesListOperationConfirmChrome({
      sheet: operationSheetModel,
      pending: operationPending,
    })
    : { label: '' }

  const operationSheetInput = operationSheetModel?.inputLabel ? {
    label: operationSheetModel.inputLabel,
    value: operationValue,
    onValueChange: setOperationValue,
  } : null
  const operationConfirmDisabled = operationSheetModel
    ? !canSubmitFilesListOperationSheet({
      sheet: operationSheetModel,
      value: operationValue,
      pending: operationPending,
      validationMessage: operationValidationMessage,
    })
    : true

  return {
    closeOperationSheet,
    confirmOperation,
    deletePending: deleteResource.isPending,
    openDeleteFiles,
    openRenameContextFile,
    openTransferContextFile,
    operationConfirmChrome,
    operationConfirmDisabled,
    operationPending,
    operationSheetInput,
    operationSheetModel,
    operationValidationMessage,
  }
}
