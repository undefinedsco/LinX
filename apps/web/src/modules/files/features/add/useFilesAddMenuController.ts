import { useState } from 'react'

import { useToast } from '@/components/ui/use-toast'
import { useFilesStore } from '../../app/store'
import {
  useCreateFolderResource,
  useCreateRawTextResource,
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
import { projectFilesAddMenuModel, type FilesAddActionId } from '../../domain/list/files-add-menu-model'
import type { FilesEntry } from '../../domain/resource/resource-model'
import { useFolderDetailUploadController } from '../folder/useFolderDetailUploadController'
import { useSourceIngestToolbarController } from '../ingest/useSourceIngestToolbarController'

export function useFilesAddMenuController({
  containerUri,
  entries,
}: {
  containerUri: string | null
  entries: FilesEntry[]
}) {
  const { toast } = useToast()
  const selectFile = useFilesStore((state) => state.selectFile)
  const setDetailTab = useFilesStore((state) => state.setDetailTab)
  const requestEditableFileSheetOpen = useFilesStore((state) => state.requestEditableFileSheetOpen)
  const createFolder = useCreateFolderResource()
  const createRawText = useCreateRawTextResource()
  const ingest = useSourceIngestToolbarController()
  const [operationState, setOperationState] = useState(createFolderChildOperationState)
  const menu = projectFilesAddMenuModel(containerUri)
  const operation = operationState.operation
  const operationSheet = projectFolderChildOperationSheetModel(operation)
  const pending = createFolder.isPending || createRawText.isPending
  const validationMessage = containerUri
    ? getFolderChildOperationValidationMessage({
        operation,
        value: operationState.value,
        containerUri,
        visibleChildren: entries,
      })
    : '先选择一个文件夹'
  const confirmDisabled = !operationSheet || !canSubmitFolderChildOperationSheet({
    sheet: operationSheet,
    value: operationState.value,
    pending,
    validationMessage,
  })

  const folderUpload = useFolderDetailUploadController({
    containerUri,
    onUploadedResource: (uri) => {
      selectFile(uri)
      setDetailTab('preview')
    },
  })

  const openCreateOperation = (nextOperation: Extract<Exclude<FolderChildOperation, null>, { type: 'create-folder' | 'create-markdown' }>) => {
    setOperationState(projectFolderChildOperationOpened({
      operation: nextOperation,
      visibleChildren: entries,
    }))
  }

  const runAction = (action: FilesAddActionId) => {
    if (!containerUri) return
    window.setTimeout(() => {
      if (action === 'create-document') {
        openCreateOperation({ type: 'create-markdown' })
        return
      }
      if (action === 'create-folder') {
        openCreateOperation({ type: 'create-folder' })
        return
      }
      if (action === 'upload-files') {
        folderUpload.openUploadPicker()
        return
      }
      if (action === 'upload-folder') {
        folderUpload.openFolderUploadPicker()
        return
      }
      ingest.setOpen(true)
    }, 0)
  }

  const confirmOperation = async () => {
    if (!containerUri || !operation) return
    const submitPlan = planFolderChildOperationSubmit({
      operation,
      value: operationState.value,
      containerUri,
      visibleChildren: entries,
      children: entries,
    })
    if (!submitPlan || (submitPlan.type !== 'create-folder' && submitPlan.type !== 'create-markdown')) return

    try {
      if (submitPlan.type === 'create-folder') {
        const folder = await createFolder.mutateAsync(submitPlan.input)
        selectFile(folder.uri)
      } else {
        const resource = await createRawText.mutateAsync({
          resource: submitPlan.input.resource,
          content: submitPlan.input.content,
        })
        selectFile(resource.uri)
        setDetailTab('preview')
        requestEditableFileSheetOpen(resource.uri)
      }
      setOperationState(projectFolderChildOperationReset())
      toast({ description: submitPlan.successMessage })
    } catch (error) {
      toast({
        description: `创建失败：${error instanceof Error ? error.message : '未知错误'}`,
        variant: 'destructive',
      })
    }
  }

  return {
    menu,
    runAction,
    folderUpload,
    ingest,
    operationSheet,
    operationValue: operationState.value,
    operationValidationMessage: validationMessage,
    operationConfirmDisabled: confirmDisabled,
    setOperationValue: (value: string) => setOperationState((current) => projectFolderChildOperationValuePatch({ current, value })),
    closeOperation: () => {
      if (!pending) setOperationState(projectFolderChildOperationReset())
    },
    confirmOperation,
  }
}
