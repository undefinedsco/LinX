import {
  buildFolderChildCopyName,
  resolveFolderChildRenameDestination,
  resolveFolderChildTransferDestination,
} from '../folder/folder-child-open'
import type { FilesEntry } from '../resource/resource-model'

export type FilesListOperation =
  | { type: 'rename'; file: FilesEntry }
  | { type: 'copy' | 'move'; file: FilesEntry }
  | { type: 'delete'; files: FilesEntry[] }
  | null

export type FilesListOperationState = {
  operation: FilesListOperation
  value: string
}

export type FilesListOperationSheetModel = {
  title: string
  description: string
  inputLabel: string | null
  confirmLabel: string
  destructive: boolean
  requiresInput: boolean
}

export type FilesListOperationConfirmChrome = {
  label: string
}

export type FilesListOperationDestinationModel = {
  destinationUri: string | null
  validationMessage: string | null
}

function siblingEntriesForFile(file: FilesEntry, baseEntries: FilesEntry[]): FilesEntry[] {
  return baseEntries.filter((entry) => entry.parentUri === file.parentUri)
}

export function getFilesListOperationInitialValue({
  operation,
  baseEntries,
}: {
  operation: FilesListOperation
  baseEntries: FilesEntry[]
}): string {
  if (!operation || operation.type === 'delete') return ''
  if (operation.type === 'rename') return operation.file.name
  if (operation.type === 'copy') return buildFolderChildCopyName(operation.file, siblingEntriesForFile(operation.file, baseEntries))
  return ''
}

export function createFilesListOperationState(): FilesListOperationState {
  return {
    operation: null,
    value: '',
  }
}

export function projectFilesListOperationOpened({
  operation,
  value,
  baseEntries,
}: {
  operation: Exclude<FilesListOperation, null>
  value?: string
  baseEntries: FilesEntry[]
}): FilesListOperationState {
  return {
    operation,
    value: value ?? getFilesListOperationInitialValue({
      operation,
      baseEntries,
    }),
  }
}

export function projectFilesListOperationValuePatch({
  current,
  value,
}: {
  current: FilesListOperationState
  value: string
}): FilesListOperationState {
  return {
    ...current,
    value,
  }
}

export function projectFilesListOperationReset(): FilesListOperationState {
  return createFilesListOperationState()
}

export function projectFilesListOperationSheetModel(
  operation: FilesListOperation,
): FilesListOperationSheetModel | null {
  if (!operation) return null

  if (operation.type === 'delete') {
    return {
      title: operation.files.length > 1 ? `删除 ${operation.files.length} 项` : '删除',
      description: operation.files.length === 1
        ? `删除“${operation.files[0]?.name ?? '资源'}”？`
        : operation.files.map((file) => file.name).join('、'),
      inputLabel: null,
      confirmLabel: '删除',
      destructive: true,
      requiresInput: false,
    }
  }

  if (operation.type === 'rename') {
    return {
      title: '重命名',
      description: operation.file.uri,
      inputLabel: '新名称',
      confirmLabel: '重命名',
      destructive: false,
      requiresInput: true,
    }
  }

  return {
    title: operation.type === 'copy' ? '复制到' : '移动到',
    description: `${operation.file.name} · ${operation.file.uri}`,
    inputLabel: '目标路径',
    confirmLabel: operation.type === 'copy' ? '复制' : '移动',
    destructive: false,
    requiresInput: true,
  }
}

export function projectFilesListOperationDestination({
  operation,
  value,
  baseEntries,
}: {
  operation: FilesListOperation
  value: string
  baseEntries: FilesEntry[]
}): FilesListOperationDestinationModel {
  if (!operation || operation.type === 'delete') {
    return { destinationUri: null, validationMessage: null }
  }

  const siblingEntries = siblingEntriesForFile(operation.file, baseEntries)

  if (operation.type === 'rename') {
    const result = resolveFolderChildRenameDestination({
      child: operation.file,
      input: value,
      siblingEntries,
    })
    if (result.ok) return { destinationUri: result.destinationUri, validationMessage: null }
    if (result.reason === 'unchanged') return { destinationUri: null, validationMessage: '名称没有变化' }
    if (result.reason === 'conflict') return { destinationUri: null, validationMessage: '当前文件夹已有同名资源' }
    if (result.reason === 'escape') return { destinationUri: null, validationMessage: '名称不能包含路径或离开当前文件夹' }
    return { destinationUri: null, validationMessage: null }
  }

  const result = resolveFolderChildTransferDestination({
    child: operation.file,
    input: value,
    containerUri: operation.file.parentUri,
    siblingEntries,
  })
  if (result.ok) return { destinationUri: result.destinationUri, validationMessage: null }
  if (result.reason === 'unchanged') return { destinationUri: null, validationMessage: '目标路径没有变化' }
  if (result.reason === 'conflict') return { destinationUri: null, validationMessage: '目标位置已有同名资源' }
  if (result.reason === 'cross-pod') return { destinationUri: null, validationMessage: `只能${operation.type === 'copy' ? '复制' : '移动'}到当前 Pod 内的位置` }
  if (result.reason === 'escape') return { destinationUri: null, validationMessage: '目标路径不能离开当前文件夹' }
  return { destinationUri: null, validationMessage: null }
}

export function getFilesListOperationValidationMessage(input: {
  operation: FilesListOperation
  value: string
  baseEntries: FilesEntry[]
}): string | null {
  return projectFilesListOperationDestination(input).validationMessage
}

export function canSubmitFilesListOperationSheet({
  sheet,
  value,
  pending,
  validationMessage,
}: {
  sheet: FilesListOperationSheetModel
  value: string
  pending: boolean
  validationMessage?: string | null
}): boolean {
  if (pending || validationMessage) return false
  if (sheet.requiresInput && value.trim().length === 0) return false
  return true
}

export function projectFilesListOperationConfirmChrome({
  sheet,
  pending,
}: {
  sheet: FilesListOperationSheetModel
  pending: boolean
}): FilesListOperationConfirmChrome {
  return {
    label: pending ? '处理中' : sheet.confirmLabel,
  }
}
