import { useCallback, useState } from 'react'

import { useToast } from '@/components/ui/use-toast'
import { useFilesStore } from '../../app/store'
import {
  useCreateFolderResource,
  useCreateVocabTermProposalInboxApproval,
  useFilesCurrentPodRootUri,
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
import {
  planNewTable,
  type NewTableColumnInput,
} from '../../domain/structured/structured-new-table'
import { createVocabTermProposal } from '../../domain/structured/structured-table'
import { predicateShapeFromDraft } from '../../domain/structured/structured-predicate-draft'
import { resolveLocalVocabTermUri } from '../../domain/structured/structured-table-vocab'
import { projectFilesAddMenuModel, type FilesAddActionId } from '../../domain/list/files-add-menu-model'
import type { FilesEntry } from '../../domain/resource/resource-model'
import { useFolderDetailUploadController } from '../folder/useFolderDetailUploadController'
import { useSourceIngestToolbarController } from '../ingest/useSourceIngestToolbarController'
import { formatFilesErrorForUser } from '@/lib/user-facing-errors'

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
  const createVocabApproval = useCreateVocabTermProposalInboxApproval()
  const podRootUri = useFilesCurrentPodRootUri()
  const [tableOpen, setTableOpen] = useState(false)
  const [tableName, setTableName] = useState('')
  const [tableColumns, setTableColumns] = useState<NewTableColumnInput[]>([{ label: '', type: 'text' }])
  const [tablePending, setTablePending] = useState(false)
  const tablePlan = containerUri
    ? planNewTable({
        containerUri,
        name: tableName,
        columns: tableColumns,
        siblingNames: entries.map((entry) => entry.name),
        currentPodRootUri: podRootUri,
      })
    : ({ ok: false, message: '先选择一个文件夹' } as const)
  const resetTable = useCallback(() => {
    setTableOpen(false)
    setTableName('')
    setTableColumns([{ label: '', type: 'text' }])
  }, [])
  const [operationState, setOperationState] = useState(createFolderChildOperationState)
  const menu = projectFilesAddMenuModel(containerUri, podRootUri)
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
      if (action === 'create-table') {
        setTableOpen(true)
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
        description: `创建失败：${formatFilesErrorForUser(error, '未知错误')}`,
        variant: 'destructive',
      })
    }
  }

  /** 新建表格: the file is written first; the class and the first columns are proposed to the vocabulary and show as 未确认. */
  const confirmTable = async () => {
    if (!tablePlan.ok || !containerUri) return
    setTablePending(true)
    try {
      const resource = await createRawText.mutateAsync({
        resource: { uri: tablePlan.documentUri, mimeType: 'text/turtle' },
        content: tablePlan.content,
      })
      const classProposal = createVocabTermProposal({
        documentUri: tablePlan.documentUri,
        classScope: null,
        termUri: tablePlan.classUri,
        termKind: 'class',
        label: tableName.trim(),
        valueType: 'class',
        description: '这张表里每一行的类型。',
        shape: 'rdf:type scope',
        podRootUri,
      })
      const proposals = [classProposal, ...tablePlan.columns.map(({ draft }) => createVocabTermProposal({
        documentUri: tablePlan.documentUri,
        // Same class the rows are typed with, so the table lists these as its 未确认 columns.
        classScope: tablePlan.classUri,
        termUri: resolveLocalVocabTermUri(tablePlan.documentUri, draft.localName, podRootUri),
        termKind: 'predicate',
        label: draft.label,
        valueType: draft.type,
        description: draft.description,
        shape: predicateShapeFromDraft(draft),
        podRootUri,
      }))]
      let proposalFailed = false
      for (const proposal of proposals) {
        try { await createVocabApproval.mutateAsync(proposal) } catch { proposalFailed = true }
      }
      selectFile(resource.uri)
      setDetailTab('preview')
      resetTable()
      toast({ description: proposalFailed ? '表格建好了，部分列没能登记到词表，可以在表格里再加。' : `已新建表格“${tableName.trim()}”` })
    } catch (error) {
      toast({
        description: `创建失败：${formatFilesErrorForUser(error, '未知错误')}`,
        variant: 'destructive',
      })
    } finally {
      setTablePending(false)
    }
  }

  return {
    newTable: {
      open: tableOpen,
      name: tableName,
      columns: tableColumns,
      pending: tablePending,
      message: tableName.trim() || tableColumns.some((column) => column.label.trim()) ? (tablePlan.ok ? null : tablePlan.message) : null,
      canCreate: tablePlan.ok && !tablePending,
      setName: setTableName,
      setColumn: (index: number, patch: Partial<NewTableColumnInput>) => setTableColumns((current) => current.map((column, i) => (i === index ? { ...column, ...patch } : column))),
      addColumn: () => setTableColumns((current) => [...current, { label: '', type: 'text' }]),
      removeColumn: (index: number) => setTableColumns((current) => current.filter((_, i) => i !== index)),
      cancel: () => { if (!tablePending) resetTable() },
      confirm: confirmTable,
    },
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
