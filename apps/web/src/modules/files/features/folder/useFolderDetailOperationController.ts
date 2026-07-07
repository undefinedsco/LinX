import { useState } from 'react'

import { useToast } from '@/components/ui/use-toast'

import { useFilesStore } from '../../app/store'
import {
  useCopyFileResource,
  useCreateFolderResource,
  useCreateRawTextResource,
  useDeleteFileResource,
  useMoveFileResource,
} from '../../data/queries'
import {
  canSubmitFolderChildOperationSheet,
  createFolderChildOperationState,
  getFolderChildOperationValidationMessage,
  planFolderChildOperationSubmit,
  projectFolderChildOperationOpened,
  projectFolderChildOperationReset,
  projectFolderChildOperationSheetModel,
  projectFolderChildOperationValuePatch,
  type FolderChildOperation,
} from '../../domain/folder/folder-operation-model'
import type { FilesDetail, FilesEntry } from '../../domain/resource/resource-model'
import { createContainerNodeId } from '../../domain/resource/tree-model'

export function useFolderDetailOperationController({
  file,
  children,
  visibleChildren,
  onDeletedUris,
}: {
  file: FilesDetail
  children: FilesEntry[]
  visibleChildren: FilesEntry[]
  onDeletedUris: (uris: Set<string>) => void
}) {
  const { toast } = useToast()
  const selectTreeNode = useFilesStore((state) => state.selectTreeNode)
  const selectFile = useFilesStore((state) => state.selectFile)
  const setDetailTab = useFilesStore((state) => state.setDetailTab)
  const createFolder = useCreateFolderResource()
  const createRawText = useCreateRawTextResource()
  const copyResource = useCopyFileResource()
  const moveResource = useMoveFileResource()
  const deleteResource = useDeleteFileResource()
  const [operationState, setOperationState] = useState(createFolderChildOperationState)
  const operation = operationState.operation
  const operationValue = operationState.value

  const pending = copyResource.isPending
    || moveResource.isPending
    || deleteResource.isPending
    || createFolder.isPending
    || createRawText.isPending

  const validationMessage = getFolderChildOperationValidationMessage({
    operation,
    value: operationValue,
    containerUri: file.uri,
    visibleChildren,
  })
  const operationSheet = projectFolderChildOperationSheetModel(operation)
  const operationConfirmDisabled = operationSheet
    ? !canSubmitFolderChildOperationSheet({
        sheet: operationSheet,
        value: operationValue,
        pending,
        validationMessage,
      })
    : true

  const openOperation = (nextOperation: Exclude<FolderChildOperation, null>, value?: string) => {
    window.setTimeout(() => {
      setOperationState(projectFolderChildOperationOpened({
        operation: nextOperation,
        value,
        visibleChildren,
      }))
    }, 0)
  }

  const openTransferOperation = (
    type: 'copy' | 'move',
    child: FilesEntry,
    context: { containerUri?: string; siblingEntries?: FilesEntry[] } = {},
  ) => {
    const siblingEntries = context.siblingEntries ?? visibleChildren
    openOperation({ type, child, ...context, siblingEntries })
  }

  const openDeleteChildren = (
    childrenToDelete: FilesEntry[],
    context: { containerUri?: string; siblingEntries?: FilesEntry[] } = {},
  ) => {
    if (childrenToDelete.length === 0) return
    openOperation({
      type: 'delete',
      children: childrenToDelete,
      containerUri: context.containerUri ?? file.uri,
      siblingEntries: context.siblingEntries ?? visibleChildren,
    })
  }

  const closeOperation = () => {
    if (pending) return
    setOperationState(projectFolderChildOperationReset())
  }

  const resetOperation = () => {
    setOperationState(projectFolderChildOperationReset())
  }

  const setOperationValue = (value: string) => {
    setOperationState((current) => projectFolderChildOperationValuePatch({
      current,
      value,
    }))
  }

  const confirmOperation = async (
    currentOperation: Exclude<FolderChildOperation, null>,
    submittedValue?: string,
  ) => {
    const submitPlan = planFolderChildOperationSubmit({
      operation: currentOperation,
      value: submittedValue ?? operationValue,
      containerUri: file.uri,
      visibleChildren,
      children,
    })
    if (!submitPlan) return

    try {
      if (submitPlan.type === 'delete-resources') {
        for (const child of submitPlan.children) {
          await deleteResource.mutateAsync(child.uri)
        }
        onDeletedUris(new Set(submitPlan.deletedUris))
        resetOperation()
        toast({ description: submitPlan.successMessage })
        return
      }

      if (submitPlan.type === 'copy-resource') {
        await copyResource.mutateAsync(submitPlan.input)
        resetOperation()
        toast({ description: submitPlan.successMessage })
        return
      }

      if (submitPlan.type === 'move-resource') {
        await moveResource.mutateAsync(submitPlan.input)
        resetOperation()
        toast({ description: submitPlan.successMessage })
        return
      }

      if (submitPlan.type === 'create-folder') {
        const folder = await createFolder.mutateAsync(submitPlan.input)
        resetOperation()
        selectTreeNode(createContainerNodeId(folder.uri))
        selectFile(folder.uri)
        toast({ description: submitPlan.successMessage })
        return
      }

      const resource = await createRawText.mutateAsync({
        resource: submitPlan.input.resource,
        content: submitPlan.input.content,
      })
      resetOperation()
      selectFile(resource.uri)
      setDetailTab('preview')
      toast({ description: submitPlan.successMessage })
    } catch (error) {
      toast({
        description: `${submitPlan.failureActionLabel}失败：${error instanceof Error ? error.message : '未知错误'}`,
        variant: 'destructive',
      })
    }
  }

  return {
    operation,
    operationValue,
    validationMessage,
    operationConfirmDisabled,
    pending,
    createFolderPending: createFolder.isPending,
    createMarkdownPending: createRawText.isPending,
    deletePending: deleteResource.isPending,
    setOperationValue,
    openOperation,
    openTransferOperation,
    openDeleteChildren,
    closeOperation,
    confirmOperation,
  }
}
