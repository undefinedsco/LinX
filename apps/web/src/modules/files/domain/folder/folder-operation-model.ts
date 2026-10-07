import type { FilesEntry } from '../resource/resource-model'
import { normalizeMarkdownFileName } from './folder-detail-model'
import {
  buildFolderChildCopyName,
  resolveFolderChildRenameDestination,
  resolveFolderChildTransferDestination,
} from './folder-child-open'

export type FolderChildOperation =
  | { type: 'rename'; child: FilesEntry; containerUri?: string; siblingEntries?: FilesEntry[] }
  | { type: 'copy' | 'move'; child: FilesEntry; containerUri?: string; siblingEntries?: FilesEntry[] }
  | { type: 'delete'; children: FilesEntry[]; containerUri?: string; siblingEntries?: FilesEntry[] }
  | { type: 'create-folder' | 'create-markdown' }
  | null

export type FolderChildOperationState = {
  operation: FolderChildOperation
  value: string
}

export type FolderChildOperationSheetModel = {
  title: string
  description: string
  inputLabel: string | null
  confirmLabel: string
  confirmTone: 'primary' | 'destructive'
  requiresInput: boolean
}

export type FolderChildOperationConfirmChrome = {
  label: string
}

export type FolderChildOperationDestinationModel = {
  destinationUri: string | null
}

export type FolderChildCreateMarkdownPlan = {
  resource: {
    uri: string
    mimeType: 'text/markdown'
  }
  content: string
}

export type FolderChildOperationSubmitPlan =
  | {
    type: 'delete-resources'
    children: FilesEntry[]
    deletedUris: string[]
    successMessage: string
    failureActionLabel: '删除'
  }
  | {
    type: 'copy-resource'
    input: {
      sourceUri: string
      destinationUri: string
    }
    successMessage: string
    failureActionLabel: '复制'
  }
  | {
    type: 'move-resource'
    input: {
      sourceUri: string
      destinationUri: string
    }
    successMessage: string
    failureActionLabel: '移动' | '重命名'
  }
  | {
    type: 'create-folder'
    input: {
      containerUri: string
      name: string
    }
    successMessage: string
    failureActionLabel: '创建'
  }
  | {
    type: 'create-markdown'
    input: FolderChildCreateMarkdownPlan
    successMessage: string
    failureActionLabel: '创建'
  }

export function projectFolderChildOperationSheetModel(
  operation: FolderChildOperation,
): FolderChildOperationSheetModel | null {
  if (!operation) return null

  switch (operation.type) {
    case 'rename':
      return {
        title: '重命名',
        description: `${operation.child.name} · ${operation.child.uri}`,
        inputLabel: '新名称',
        confirmLabel: '重命名',
        confirmTone: 'primary',
        requiresInput: true,
      }
    case 'copy':
      return {
        title: '复制到',
        description: `${operation.child.name} · ${operation.child.uri}`,
        inputLabel: '目标路径',
        confirmLabel: '复制',
        confirmTone: 'primary',
        requiresInput: true,
      }
    case 'move':
      return {
        title: '移动到',
        description: `${operation.child.name} · ${operation.child.uri}`,
        inputLabel: '目标路径',
        confirmLabel: '移动',
        confirmTone: 'primary',
        requiresInput: true,
      }
    case 'delete':
      return {
        title: operation.children.length > 1 ? `删除 ${operation.children.length} 项` : '删除',
        description: operation.children.length === 1
          ? `删除“${operation.children[0]?.name ?? '资源'}”？`
          : operation.children.map((child) => child.name).join('、'),
        inputLabel: null,
        confirmLabel: '删除',
        confirmTone: 'destructive',
        requiresInput: false,
      }
    case 'create-folder':
      return {
        title: '新建文件夹',
        description: '在当前文件夹中创建一个子文件夹。',
        inputLabel: '名称',
        confirmLabel: '创建',
        confirmTone: 'primary',
        requiresInput: true,
      }
    case 'create-markdown':
      return {
        title: '新建 Markdown 文件',
        description: '在当前文件夹中创建一个可编辑 Markdown 文件。',
        inputLabel: '文件名',
        confirmLabel: '创建',
        confirmTone: 'primary',
        requiresInput: true,
      }
  }
}

export function canSubmitFolderChildOperationSheet({
  sheet,
  value,
  pending,
  validationMessage,
}: {
  sheet: FolderChildOperationSheetModel
  value: string
  pending: boolean
  validationMessage?: string | null
}): boolean {
  if (pending || validationMessage) return false
  if (sheet.requiresInput && value.trim().length === 0) return false
  return true
}

export function projectFolderChildOperationConfirmChrome({
  sheet,
  pending,
}: {
  sheet: FolderChildOperationSheetModel
  pending: boolean
}): FolderChildOperationConfirmChrome {
  return {
    label: pending ? '处理中' : sheet.confirmLabel,
  }
}

export function getFolderChildOperationInitialValue({
  operation,
  visibleChildren,
}: {
  operation: FolderChildOperation
  visibleChildren: FilesEntry[]
}): string {
  if (!operation || operation.type === 'delete') return ''
  if (operation.type === 'rename') return operation.child.name
  if (operation.type === 'copy') {
    return buildFolderChildCopyName(operation.child, operation.siblingEntries ?? visibleChildren)
  }
  if (operation.type === 'create-folder') return 'Untitled folder'
  if (operation.type === 'create-markdown') return 'Untitled.md'
  return ''
}

export function createFolderChildOperationState(): FolderChildOperationState {
  return {
    operation: null,
    value: '',
  }
}

export function projectFolderChildOperationOpened({
  operation,
  value,
  visibleChildren,
}: {
  operation: Exclude<FolderChildOperation, null>
  value?: string
  visibleChildren: FilesEntry[]
}): FolderChildOperationState {
  return {
    operation,
    value: value ?? getFolderChildOperationInitialValue({
      operation,
      visibleChildren,
    }),
  }
}

export function projectFolderChildOperationValuePatch({
  current,
  value,
}: {
  current: FolderChildOperationState
  value: string
}): FolderChildOperationState {
  return {
    ...current,
    value,
  }
}

export function projectFolderChildOperationReset(): FolderChildOperationState {
  return createFolderChildOperationState()
}

export function projectFolderChildOperationDestination({
  operation,
  value,
  containerUri,
  visibleChildren,
}: {
  operation: FolderChildOperation
  value: string
  containerUri: string
  visibleChildren: FilesEntry[]
}): FolderChildOperationDestinationModel {
  if (!operation || operation.type === 'delete' || operation.type === 'create-folder' || operation.type === 'create-markdown') {
    return { destinationUri: null }
  }

  if (operation.type === 'rename') {
    const destination = resolveFolderChildRenameDestination({
      child: operation.child,
      input: value,
      siblingEntries: operation.siblingEntries ?? visibleChildren,
    })
    return { destinationUri: destination.ok ? destination.destinationUri : null }
  }

  if (operation.type === 'copy' || operation.type === 'move') {
    const destination = resolveFolderChildTransferDestination({
      child: operation.child,
      input: value,
      containerUri: operation.containerUri ?? containerUri,
      siblingEntries: operation.siblingEntries ?? visibleChildren,
    })
    return { destinationUri: destination.ok ? destination.destinationUri : null }
  }

  return { destinationUri: null }
}

export function planFolderChildCreateMarkdownResource({
  value,
  containerUri,
  children,
}: {
  value: string
  containerUri: string
  children: FilesEntry[]
}): FolderChildCreateMarkdownPlan | null {
  const trimmedValue = value.trim()
  if (!trimmedValue) return null
  if (/^(?:https?:)?\/\//i.test(trimmedValue) || trimmedValue.includes('/') || trimmedValue.includes('..')) return null

  const fileName = normalizeMarkdownFileName(trimmedValue)
  const resourceUri = new URL(fileName, containerUri).toString()
  if (children.some((child) => child.name === fileName || child.uri === resourceUri)) return null

  const title = fileName.replace(/\.md$/i, '').trim() || 'Untitled'
  return {
    resource: {
      uri: resourceUri,
      mimeType: 'text/markdown',
    },
    content: `# ${title}\n`,
  }
}

export function planFolderChildOperationSubmit({
  operation,
  value,
  containerUri,
  visibleChildren,
  children,
}: {
  operation: FolderChildOperation
  value: string
  containerUri: string
  visibleChildren: FilesEntry[]
  children: FilesEntry[]
}): FolderChildOperationSubmitPlan | null {
  if (!operation) return null

  if (operation.type === 'delete') {
    if (operation.children.length === 0) return null
    return {
      type: 'delete-resources',
      children: operation.children,
      deletedUris: operation.children.map((child) => child.uri),
      successMessage: operation.children.length > 1 ? `已删除 ${operation.children.length} 项` : '文件已删除',
      failureActionLabel: '删除',
    }
  }

  const trimmedValue = value.trim()
  if (!trimmedValue) return null

  const validationMessage = getFolderChildOperationValidationMessage({
    operation,
    value: trimmedValue,
    containerUri,
    visibleChildren,
  })
  if (validationMessage) return null

  if (operation.type === 'rename' || operation.type === 'copy' || operation.type === 'move') {
    const { destinationUri } = projectFolderChildOperationDestination({
      operation,
      value: trimmedValue,
      containerUri: operation.type === 'rename' ? containerUri : operation.containerUri ?? containerUri,
      visibleChildren,
    })
    if (!destinationUri) return null

    if (operation.type === 'copy') {
      return {
        type: 'copy-resource',
        input: {
          sourceUri: operation.child.uri,
          destinationUri,
        },
        successMessage: '文件复制已开始',
        failureActionLabel: '复制',
      }
    }

    return {
      type: 'move-resource',
      input: {
        sourceUri: operation.child.uri,
        destinationUri,
      },
      successMessage: operation.type === 'rename' ? '重命名已开始' : '文件移动已开始',
      failureActionLabel: operation.type === 'rename' ? '重命名' : '移动',
    }
  }

  if (operation.type === 'create-folder') {
    return {
      type: 'create-folder',
      input: {
        containerUri,
        name: trimmedValue,
      },
      successMessage: '文件夹已创建',
      failureActionLabel: '创建',
    }
  }

  const markdownPlan = planFolderChildCreateMarkdownResource({
    value: trimmedValue,
    containerUri,
    children,
  })
  if (!markdownPlan) return null

  return {
    type: 'create-markdown',
    input: markdownPlan,
    successMessage: '文件已创建',
    failureActionLabel: '创建',
  }
}

export function getFolderChildOperationValidationMessage({
  operation,
  value,
  containerUri,
  visibleChildren,
}: {
  operation: FolderChildOperation
  value: string
  containerUri: string
  visibleChildren: FilesEntry[]
}): string | null {
  if (!operation || operation.type === 'delete') return null
  const trimmedValue = value.trim()
  if (!trimmedValue) return null

  if (operation.type === 'rename') {
    const siblingEntries = operation.siblingEntries ?? visibleChildren
    const destination = resolveFolderChildRenameDestination({
      child: operation.child,
      input: trimmedValue,
      siblingEntries,
    })
    if (!destination.ok) {
      if (destination.reason === 'unchanged') return '名称未变化'
      if (destination.reason === 'conflict') return '同名项目已存在'
      if (destination.reason === 'escape') return '名称不能包含路径'
      return null
    }
    if (siblingEntries.some((child) => child.uri !== operation.child.uri && child.name === trimmedValue)) return '同名项目已存在'
    if (siblingEntries.some((child) => child.uri !== operation.child.uri && child.uri === destination.destinationUri)) return '同名项目已存在'
    return null
  }

  if (operation.type === 'copy' || operation.type === 'move') {
    const destination = resolveFolderChildTransferDestination({
      child: operation.child,
      input: trimmedValue,
      containerUri: operation.containerUri ?? containerUri,
      siblingEntries: operation.siblingEntries ?? visibleChildren,
    })
    if (destination.ok) return null
    if (destination.reason === 'unchanged') return '目标和原文件相同'
    if (destination.reason === 'conflict') return '同名项目已存在'
    if (destination.reason === 'cross-pod') return '不能移动到其他 Pod'
    if (destination.reason === 'escape') return '目标路径不能离开当前文件夹'
    return null
  }

  if (/^(?:https?:)?\/\//i.test(trimmedValue) || trimmedValue.includes('/') || trimmedValue.includes('..')) return '名称不能包含路径'
  if (operation.type === 'create-markdown') {
    const fileName = normalizeMarkdownFileName(trimmedValue)
    const resourceUri = new URL(fileName, containerUri).toString()
    if (visibleChildren.some((child) => child.name === fileName || child.uri === resourceUri)) return '同名项目已存在'
    return null
  }
  if (visibleChildren.some((child) => child.name === trimmedValue)) return '同名项目已存在'
  return null
}
