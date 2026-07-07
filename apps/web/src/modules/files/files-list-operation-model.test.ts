import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import type { FilesEntry } from './domain/resource/resource-model'
import {
  canSubmitFilesListOperationSheet,
  createFilesListOperationState,
  getFilesListOperationInitialValue,
  getFilesListOperationValidationMessage,
  projectFilesListOperationOpened,
  projectFilesListOperationReset,
  projectFilesListOperationConfirmChrome,
  projectFilesListOperationDestination,
  projectFilesListOperationSheetModel,
  projectFilesListOperationValuePatch,
  type FilesListOperation,
} from './domain/list/files-list-operation-model'

const listOperationModelPath = 'src/modules/files/domain/list/files-list-operation-model.ts'

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

function operationDestination(
  operation: Exclude<FilesListOperation, null>,
  value: string,
  baseEntries: FilesEntry[] = [entry()],
) {
  return projectFilesListOperationDestination({ operation, value, baseEntries })
}

function validationMessage(
  operation: Exclude<FilesListOperation, null>,
  value: string,
  baseEntries: FilesEntry[] = [entry()],
) {
  return getFilesListOperationValidationMessage({ operation, value, baseEntries })
}

describe('files list operation model', () => {
  it('keeps list operation projection and validation in a pure domain model', () => {
    expect(existsSync(listOperationModelPath)).toBe(true)
    if (!existsSync(listOperationModelPath)) return

    const modelSource = readFileSync(listOperationModelPath, 'utf8')

    expect(modelSource).toContain('export type FilesListOperation')
    expect(modelSource).toContain('export type FilesListOperationState')
    expect(modelSource).toContain('export function getFilesListOperationInitialValue')
    expect(modelSource).toContain('export function createFilesListOperationState')
    expect(modelSource).toContain('export function projectFilesListOperationOpened')
    expect(modelSource).toContain('export function projectFilesListOperationValuePatch')
    expect(modelSource).toContain('export function projectFilesListOperationReset')
    expect(modelSource).toContain('export function projectFilesListOperationSheetModel')
    expect(modelSource).toContain('export function projectFilesListOperationConfirmChrome')
    expect(modelSource).toContain('export function projectFilesListOperationDestination')
    expect(modelSource).toContain('export function getFilesListOperationValidationMessage')
    expect(modelSource).toContain('export function canSubmitFilesListOperationSheet')
    expect(modelSource).not.toContain('useState')
    expect(modelSource).not.toContain('useMemo')
    expect(modelSource).not.toContain('useToast')
  })

  it('projects initial values and sheet copy for list operations', () => {
    const readme = entry({ name: 'readme.md', uri: 'https://pod.example/files/readme.md' })
    const copy = entry({ name: 'readme copy.md', uri: 'https://pod.example/files/readme%20copy.md' })

    expect(getFilesListOperationInitialValue({
      operation: { type: 'rename', file: readme },
      baseEntries: [readme],
    })).toBe('readme.md')
    expect(getFilesListOperationInitialValue({
      operation: { type: 'copy', file: readme },
      baseEntries: [readme, copy],
    })).toBe('readme copy 2.md')
    expect(getFilesListOperationInitialValue({
      operation: { type: 'move', file: readme },
      baseEntries: [readme],
    })).toBe('')

    expect(projectFilesListOperationSheetModel({ type: 'rename', file: readme }))
      .toEqual({
        confirmLabel: '重命名',
        description: 'https://pod.example/files/readme.md',
        destructive: false,
        inputLabel: '新名称',
        requiresInput: true,
        title: '重命名',
      })
    expect(projectFilesListOperationSheetModel({ type: 'delete', files: [readme] }))
      .toEqual({
        confirmLabel: '删除',
        description: '删除“readme.md”？',
        destructive: true,
        inputLabel: null,
        requiresInput: false,
        title: '删除',
      })
    expect(projectFilesListOperationSheetModel(null)).toBeNull()
    const renameSheet = projectFilesListOperationSheetModel({ type: 'rename', file: readme })
    expect(renameSheet).not.toBeNull()
    if (!renameSheet) return

    expect(projectFilesListOperationConfirmChrome({
      sheet: renameSheet,
      pending: false,
    })).toEqual({ label: '重命名' })
    expect(projectFilesListOperationConfirmChrome({
      sheet: renameSheet,
      pending: true,
    })).toEqual({ label: '处理中' })
  })

  it('projects list operation controller state transitions in the pure model', () => {
    const readme = entry({ name: 'readme.md', uri: 'https://pod.example/files/readme.md' })
    const existingCopy = entry({ name: 'readme copy.md', uri: 'https://pod.example/files/readme%20copy.md' })
    const initial = createFilesListOperationState()

    expect(initial).toEqual({
      operation: null,
      value: '',
    })

    const renameOperation = { type: 'rename', file: readme } satisfies Exclude<FilesListOperation, null>
    expect(projectFilesListOperationOpened({
      operation: renameOperation,
      baseEntries: [readme],
    })).toEqual({
      operation: renameOperation,
      value: 'readme.md',
    })
    expect(projectFilesListOperationOpened({
      operation: { type: 'copy', file: readme },
      baseEntries: [readme, existingCopy],
    })).toMatchObject({
      value: 'readme copy 2.md',
    })
    expect(projectFilesListOperationOpened({
      operation: { type: 'move', file: readme },
      value: 'archive/readme.md',
      baseEntries: [readme],
    })).toMatchObject({
      value: 'archive/readme.md',
    })
    expect(projectFilesListOperationOpened({
      operation: { type: 'delete', files: [readme] },
      baseEntries: [readme],
    })).toMatchObject({
      value: '',
    })
    expect(projectFilesListOperationValuePatch({
      current: initial,
      value: 'Draft.md',
    })).toEqual({
      operation: null,
      value: 'Draft.md',
    })
    expect(projectFilesListOperationReset()).toEqual(initial)
  })

  it('projects destination and validation messages for rename and transfer operations', () => {
    const readme = entry({ name: 'readme.md', uri: 'https://pod.example/files/readme.md' })
    const notes = entry({ name: 'notes.md', uri: 'https://pod.example/files/notes.md' })

    expect(operationDestination({ type: 'rename', file: readme }, 'draft.md', [readme, notes]))
      .toEqual({ destinationUri: 'https://pod.example/files/draft.md', validationMessage: null })
    expect(validationMessage({ type: 'rename', file: readme }, 'readme.md', [readme, notes]))
      .toBe('名称没有变化')
    expect(validationMessage({ type: 'rename', file: readme }, 'docs/readme.md', [readme, notes]))
      .toBe('名称不能包含路径或离开当前文件夹')
    expect(validationMessage({ type: 'rename', file: readme }, 'notes.md', [readme, notes]))
      .toBe('当前文件夹已有同名资源')

    expect(validationMessage({ type: 'copy', file: readme }, 'readme.md', [readme, notes]))
      .toBe('目标路径没有变化')
    expect(validationMessage({ type: 'move', file: readme }, 'notes.md', [readme, notes]))
      .toBe('目标位置已有同名资源')
    expect(validationMessage({ type: 'copy', file: readme }, 'https://other.example/files/readme.md', [readme, notes]))
      .toBe('只能复制到当前 Pod 内的位置')
    expect(validationMessage({ type: 'move', file: readme }, '../readme.md', [readme, notes]))
      .toBe('目标路径不能离开当前文件夹')
    expect(operationDestination({ type: 'delete', files: [readme] }, '', [readme, notes]))
      .toEqual({ destinationUri: null, validationMessage: null })
  })

  it('keeps list operation submit readiness in the pure model', () => {
    const readme = entry({ name: 'readme.md', uri: 'https://pod.example/files/readme.md' })
    const renameSheet = projectFilesListOperationSheetModel({ type: 'rename', file: readme })!
    const deleteSheet = projectFilesListOperationSheetModel({ type: 'delete', files: [readme] })!

    expect(canSubmitFilesListOperationSheet({
      sheet: renameSheet,
      value: '',
      pending: false,
      validationMessage: null,
    })).toBe(false)
    expect(canSubmitFilesListOperationSheet({
      sheet: renameSheet,
      value: 'notes.md',
      pending: false,
      validationMessage: null,
    })).toBe(true)
    expect(canSubmitFilesListOperationSheet({
      sheet: renameSheet,
      value: 'notes.md',
      pending: true,
      validationMessage: null,
    })).toBe(false)
    expect(canSubmitFilesListOperationSheet({
      sheet: renameSheet,
      value: 'notes.md',
      pending: false,
      validationMessage: '当前文件夹已有同名资源',
    })).toBe(false)
    expect(canSubmitFilesListOperationSheet({
      sheet: deleteSheet,
      value: '',
      pending: false,
      validationMessage: null,
    })).toBe(true)
  })
})
