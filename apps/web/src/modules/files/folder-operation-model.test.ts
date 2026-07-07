import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { FilesEntry } from './domain/resource/resource-model'
import {
  canSubmitFolderChildOperationSheet,
  createFolderChildOperationState,
  getFolderChildOperationInitialValue,
  getFolderChildOperationValidationMessage,
  planFolderChildCreateMarkdownResource,
  planFolderChildOperationSubmit,
  projectFolderChildOperationOpened,
  projectFolderChildOperationReset,
  projectFolderChildOperationValuePatch,
  projectFolderChildOperationDestination,
  projectFolderChildOperationConfirmChrome,
  projectFolderChildOperationSheetModel,
  type FolderChildOperation,
} from './domain/folder/folder-operation-model'

const folderOperationModelPath = 'src/modules/files/domain/folder/folder-operation-model.ts'
const rootFolderOperationModelShimPath = 'src/modules/files/folder-operation-model.ts'

function entry(overrides: Partial<FilesEntry> = {}): FilesEntry {
  return {
    id: overrides.uri ?? 'https://pod.example/files/readme.md',
    uri: overrides.uri ?? 'https://pod.example/files/readme.md',
    name: overrides.name ?? 'readme.md',
    kind: overrides.kind ?? 'resource',
    semanticKind: overrides.semanticKind ?? 'file',
    parentUri: overrides.parentUri ?? 'https://pod.example/files/',
    mimeType: overrides.mimeType ?? 'text/markdown',
    size: overrides.size ?? 10,
    modifiedAt: overrides.modifiedAt ?? '2026-06-01T00:00:00.000Z',
  }
}

function validationMessage(
  operation: Exclude<FolderChildOperation, null>,
  value: string,
  visibleChildren: FilesEntry[] = [entry()],
) {
  return getFolderChildOperationValidationMessage({
    operation,
    value,
    containerUri: 'https://pod.example/files/',
    visibleChildren,
  })
}

describe('folder operation model', () => {
  it('keeps folder operation input validation in a pure domain model', () => {
    expect(existsSync(folderOperationModelPath)).toBe(true)
    expect(existsSync(rootFolderOperationModelShimPath)).toBe(true)
    if (!existsSync(folderOperationModelPath) || !existsSync(rootFolderOperationModelShimPath)) return

    const modelSource = readFileSync(folderOperationModelPath, 'utf8')
    const rootShimSource = readFileSync(rootFolderOperationModelShimPath, 'utf8')

    expect(modelSource).toContain('export type FolderChildOperation')
    expect(modelSource).toContain('export function getFolderChildOperationValidationMessage')
    expect(modelSource).toContain('export function projectFolderChildOperationSheetModel')
    expect(modelSource).toContain('export function canSubmitFolderChildOperationSheet')
    expect(modelSource).toContain('export function getFolderChildOperationInitialValue')
    expect(modelSource).toContain('export function createFolderChildOperationState')
    expect(modelSource).toContain('export function projectFolderChildOperationOpened')
    expect(modelSource).toContain('export function projectFolderChildOperationValuePatch')
    expect(modelSource).toContain('export function projectFolderChildOperationReset')
    expect(modelSource).toContain('export function projectFolderChildOperationDestination')
    expect(modelSource).toContain('export function planFolderChildCreateMarkdownResource')
    expect(modelSource).toContain('export function planFolderChildOperationSubmit')
    expect(modelSource).not.toContain('useState')
    expect(modelSource).not.toContain('useMemo')
    expect(modelSource).not.toContain('useToast')
    expect(rootShimSource).toMatch(/^export \* from '.\/domain\/folder\/folder-operation-model'\n?$/)
  })

  it('validates rename, transfer, and create operations with folder-facing messages', () => {
    const readme = entry({ name: 'readme.md', uri: 'https://pod.example/files/readme.md' })
    const existing = entry({ name: 'notes.md', uri: 'https://pod.example/files/notes.md' })

    expect(validationMessage({ type: 'rename', child: readme }, 'readme.md', [readme, existing]))
      .toBe('名称未变化')
    expect(validationMessage({ type: 'rename', child: readme }, 'docs/readme.md', [readme, existing]))
      .toBe('名称不能包含路径')
    expect(validationMessage({ type: 'rename', child: readme }, 'notes.md', [readme, existing]))
      .toBe('同名项目已存在')

    expect(validationMessage({ type: 'copy', child: readme }, 'readme.md', [readme, existing]))
      .toBe('目标和原文件相同')
    expect(validationMessage({ type: 'move', child: readme }, 'notes.md', [readme, existing]))
      .toBe('同名项目已存在')
    expect(validationMessage({ type: 'move', child: readme }, 'https://other.example/files/readme.md', [readme, existing]))
      .toBe('不能移动到其他 Pod')
    expect(validationMessage({ type: 'move', child: readme }, '../readme.md', [readme, existing]))
      .toBe('目标路径不能离开当前文件夹')

    expect(validationMessage({ type: 'create-folder' }, 'docs/readme', [readme, existing]))
      .toBe('名称不能包含路径')
    expect(validationMessage({ type: 'create-markdown' }, 'notes', [readme, existing]))
      .toBe('同名项目已存在')
    expect(validationMessage({ type: 'create-markdown' }, 'draft', [readme, existing]))
      .toBeNull()
    expect(validationMessage({ type: 'delete', children: [readme] }, '', [readme, existing]))
      .toBeNull()
  })

  it('projects folder operation sheet copy without renderer branching', () => {
    const readme = entry({ name: 'readme.md', uri: 'https://pod.example/files/readme.md' })
    const notes = entry({ name: 'notes.md', uri: 'https://pod.example/files/notes.md' })

    expect(projectFolderChildOperationSheetModel({ type: 'rename', child: readme }))
      .toEqual({
        confirmLabel: '重命名',
        confirmTone: 'primary',
        description: 'readme.md · https://pod.example/files/readme.md',
        inputLabel: '新名称',
        requiresInput: true,
        title: '重命名',
      })
    expect(projectFolderChildOperationSheetModel({ type: 'delete', children: [readme] }))
      .toEqual({
        confirmLabel: '删除',
        confirmTone: 'destructive',
        description: '删除“readme.md”？',
        inputLabel: null,
        requiresInput: false,
        title: '删除',
      })
    expect(projectFolderChildOperationSheetModel({ type: 'delete', children: [readme, notes] }))
      .toEqual(expect.objectContaining({
        description: 'readme.md、notes.md',
        title: '删除 2 项',
      }))
    expect(projectFolderChildOperationSheetModel({ type: 'create-markdown' }))
      .toEqual(expect.objectContaining({
        confirmLabel: '创建',
        description: '在当前文件夹中创建一个可编辑 Markdown 文件。',
        inputLabel: '文件名',
        requiresInput: true,
        title: '新建 Markdown 文件',
      }))
    expect(projectFolderChildOperationSheetModel(null)).toBeNull()
    const renameSheet = projectFolderChildOperationSheetModel({ type: 'rename', child: readme })
    expect(renameSheet).not.toBeNull()
    if (!renameSheet) return

    expect(projectFolderChildOperationConfirmChrome({
      sheet: renameSheet,
      pending: false,
    })).toEqual({ label: '重命名' })
    expect(projectFolderChildOperationConfirmChrome({
      sheet: renameSheet,
      pending: true,
    })).toEqual({ label: '处理中' })
  })

  it('projects folder operation initial values and mutation destinations', () => {
    const readme = entry({ name: 'readme.md', uri: 'https://pod.example/files/readme.md' })
    const existingCopy = entry({ name: 'readme copy.md', uri: 'https://pod.example/files/readme%20copy.md' })
    const notes = entry({ name: 'notes.md', uri: 'https://pod.example/files/notes.md' })

    expect(getFolderChildOperationInitialValue({
      operation: { type: 'rename', child: readme },
      visibleChildren: [readme],
    })).toBe('readme.md')
    expect(getFolderChildOperationInitialValue({
      operation: { type: 'copy', child: readme },
      visibleChildren: [readme, existingCopy],
    })).toBe('readme copy 2.md')
    expect(getFolderChildOperationInitialValue({
      operation: { type: 'move', child: readme },
      visibleChildren: [readme],
    })).toBe('')
    expect(getFolderChildOperationInitialValue({
      operation: { type: 'create-folder' },
      visibleChildren: [readme],
    })).toBe('Untitled folder')
    expect(getFolderChildOperationInitialValue({
      operation: { type: 'create-markdown' },
      visibleChildren: [readme],
    })).toBe('Untitled.md')

    expect(projectFolderChildOperationDestination({
      operation: { type: 'rename', child: readme },
      value: 'draft.md',
      containerUri: 'https://pod.example/files/',
      visibleChildren: [readme, notes],
    })).toEqual({ destinationUri: 'https://pod.example/files/draft.md' })
    expect(projectFolderChildOperationDestination({
      operation: { type: 'copy', child: readme },
      value: 'draft.md',
      containerUri: 'https://pod.example/files/',
      visibleChildren: [readme, notes],
    })).toEqual({ destinationUri: 'https://pod.example/files/draft.md' })
    expect(projectFolderChildOperationDestination({
      operation: { type: 'copy', child: readme },
      value: 'notes.md',
      containerUri: 'https://pod.example/files/',
      visibleChildren: [readme, notes],
    })).toEqual({ destinationUri: null })
    expect(projectFolderChildOperationDestination({
      operation: { type: 'delete', children: [readme] },
      value: '',
      containerUri: 'https://pod.example/files/',
      visibleChildren: [readme, notes],
    })).toEqual({ destinationUri: null })
  })

  it('projects folder operation controller state transitions in the pure model', () => {
    const readme = entry({ name: 'readme.md', uri: 'https://pod.example/files/readme.md' })
    const existingCopy = entry({ name: 'readme copy.md', uri: 'https://pod.example/files/readme%20copy.md' })
    const initial = createFolderChildOperationState()

    expect(initial).toEqual({
      operation: null,
      value: '',
    })

    const renameOperation = { type: 'rename', child: readme } satisfies Exclude<FolderChildOperation, null>
    expect(projectFolderChildOperationOpened({
      operation: renameOperation,
      visibleChildren: [readme],
    })).toEqual({
      operation: renameOperation,
      value: 'readme.md',
    })
    expect(projectFolderChildOperationOpened({
      operation: { type: 'copy', child: readme },
      visibleChildren: [readme, existingCopy],
    })).toMatchObject({
      value: 'readme copy 2.md',
    })
    expect(projectFolderChildOperationOpened({
      operation: { type: 'move', child: readme },
      value: 'archive/readme.md',
      visibleChildren: [readme],
    })).toMatchObject({
      value: 'archive/readme.md',
    })
    expect(projectFolderChildOperationValuePatch({
      current: initial,
      value: 'Draft.md',
    })).toEqual({
      operation: null,
      value: 'Draft.md',
    })
    expect(projectFolderChildOperationReset()).toEqual(initial)
  })

  it('plans markdown creation resource and starter content in the pure model', () => {
    const readme = entry({ name: 'readme.md', uri: 'https://pod.example/files/readme.md' })

    expect(planFolderChildCreateMarkdownResource({
      value: 'Draft',
      containerUri: 'https://pod.example/files/',
      children: [readme],
    })).toEqual({
      content: '# Draft\n',
      resource: {
        uri: 'https://pod.example/files/Draft.md',
        mimeType: 'text/markdown',
      },
    })
    expect(planFolderChildCreateMarkdownResource({
      value: 'readme',
      containerUri: 'https://pod.example/files/',
      children: [readme],
    })).toBeNull()
    expect(planFolderChildCreateMarkdownResource({
      value: '../Draft',
      containerUri: 'https://pod.example/files/',
      children: [readme],
    })).toBeNull()
  })

  it('plans folder operation submit commands and post-mutation copy in the pure model', () => {
    const readme = entry({ name: 'readme.md', uri: 'https://pod.example/files/readme.md' })
    const notes = entry({ name: 'notes.md', uri: 'https://pod.example/files/notes.md' })

    expect(planFolderChildOperationSubmit({
      operation: { type: 'rename', child: readme },
      value: ' Draft.md ',
      containerUri: 'https://pod.example/files/',
      visibleChildren: [readme, notes],
      children: [readme, notes],
    })).toEqual({
      type: 'move-resource',
      input: {
        sourceUri: 'https://pod.example/files/readme.md',
        destinationUri: 'https://pod.example/files/Draft.md',
      },
      successMessage: '重命名已开始',
      failureActionLabel: '重命名',
    })

    expect(planFolderChildOperationSubmit({
      operation: { type: 'copy', child: readme },
      value: 'copy.md',
      containerUri: 'https://pod.example/files/',
      visibleChildren: [readme, notes],
      children: [readme, notes],
    })).toEqual({
      type: 'copy-resource',
      input: {
        sourceUri: 'https://pod.example/files/readme.md',
        destinationUri: 'https://pod.example/files/copy.md',
      },
      successMessage: '文件复制已开始',
      failureActionLabel: '复制',
    })

    expect(planFolderChildOperationSubmit({
      operation: { type: 'delete', children: [readme, notes] },
      value: '',
      containerUri: 'https://pod.example/files/',
      visibleChildren: [readme, notes],
      children: [readme, notes],
    })).toEqual({
      type: 'delete-resources',
      children: [readme, notes],
      deletedUris: ['https://pod.example/files/readme.md', 'https://pod.example/files/notes.md'],
      successMessage: '已删除 2 项',
      failureActionLabel: '删除',
    })

    expect(planFolderChildOperationSubmit({
      operation: { type: 'create-folder' },
      value: ' Docs ',
      containerUri: 'https://pod.example/files/',
      visibleChildren: [readme, notes],
      children: [readme, notes],
    })).toEqual({
      type: 'create-folder',
      input: {
        containerUri: 'https://pod.example/files/',
        name: 'Docs',
      },
      successMessage: '文件夹已创建',
      failureActionLabel: '创建',
    })

    expect(planFolderChildOperationSubmit({
      operation: { type: 'create-markdown' },
      value: 'Agenda',
      containerUri: 'https://pod.example/files/',
      visibleChildren: [readme, notes],
      children: [readme, notes],
    })).toEqual({
      type: 'create-markdown',
      input: {
        resource: {
          uri: 'https://pod.example/files/Agenda.md',
          mimeType: 'text/markdown',
        },
        content: '# Agenda\n',
      },
      successMessage: '文件已创建',
      failureActionLabel: '创建',
    })

    expect(planFolderChildOperationSubmit({
      operation: { type: 'rename', child: readme },
      value: 'notes.md',
      containerUri: 'https://pod.example/files/',
      visibleChildren: [readme, notes],
      children: [readme, notes],
    })).toBeNull()
    expect(planFolderChildOperationSubmit({
      operation: { type: 'create-markdown' },
      value: '',
      containerUri: 'https://pod.example/files/',
      visibleChildren: [readme, notes],
      children: [readme, notes],
    })).toBeNull()
  })

  it('keeps folder operation sheet submit readiness in the pure model', () => {
    const readme = entry({ name: 'readme.md', uri: 'https://pod.example/files/readme.md' })
    const renameSheet = projectFolderChildOperationSheetModel({ type: 'rename', child: readme })!
    const deleteSheet = projectFolderChildOperationSheetModel({ type: 'delete', children: [readme] })!

    expect(canSubmitFolderChildOperationSheet({
      sheet: renameSheet,
      value: '',
      pending: false,
      validationMessage: null,
    })).toBe(false)
    expect(canSubmitFolderChildOperationSheet({
      sheet: renameSheet,
      value: 'notes.md',
      pending: false,
      validationMessage: null,
    })).toBe(true)
    expect(canSubmitFolderChildOperationSheet({
      sheet: renameSheet,
      value: 'notes.md',
      pending: true,
      validationMessage: null,
    })).toBe(false)
    expect(canSubmitFolderChildOperationSheet({
      sheet: renameSheet,
      value: 'notes.md',
      pending: false,
      validationMessage: '同名项目已存在',
    })).toBe(false)
    expect(canSubmitFolderChildOperationSheet({
      sheet: deleteSheet,
      value: '',
      pending: false,
      validationMessage: null,
    })).toBe(true)
  })
})
