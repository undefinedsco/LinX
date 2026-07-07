import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { FilesSaveConflictError, type FilesRawTextResource } from '../../domain/resource/resource-model'
import {
  canSubmitFileEditorRawSourceProposal,
  createFileEditorRawSourceDraftState,
  getFileEditorRawSourceResource,
  getFileEditorRawSourceSaveErrorMessage,
  isFileEditorRawSourceDirty,
  planFileEditorRawSourceSave,
  projectFileEditorRawSourceChrome,
  projectFileEditorRawSourceDraftPatch,
  projectFileEditorRawSourceHydration,
  projectFileEditorRawSourceState,
  projectFileEditorRawSourceDraft,
} from './file-editor-raw-source-model'

const modelPath = 'src/modules/files/features/editor/file-editor-raw-source-model.ts'
const controllerPath = 'src/modules/files/features/editor/useFileEditorRawSourceController.ts'
const featurePath = 'src/modules/files/features/editor/FileEditorRawSourceEditor.tsx'

function rawResource(overrides: Partial<FilesRawTextResource> = {}): FilesRawTextResource {
  return {
    uri: overrides.uri ?? 'https://pod.example/files/report.md',
    content: overrides.content ?? '# Report\n',
    mimeType: overrides.mimeType ?? 'text/markdown',
    etag: overrides.etag ?? '"etag"',
    headers: overrides.headers ?? {},
  }
}

describe('file editor raw source model', () => {
  it('keeps raw source draft/save/proposal decisions in a pure model', () => {
    expect(existsSync(modelPath)).toBe(true)
    expect(existsSync(controllerPath)).toBe(true)
    expect(existsSync(featurePath)).toBe(true)
    if (!existsSync(modelPath) || !existsSync(controllerPath) || !existsSync(featurePath)) return

    const modelSource = readFileSync(modelPath, 'utf8')
    const controllerSource = readFileSync(controllerPath, 'utf8')
    const featureSource = readFileSync(featurePath, 'utf8')

    expect(modelSource).toContain('export function projectFileEditorRawSourceDraft')
    expect(modelSource).toContain('export function createFileEditorRawSourceDraftState')
    expect(modelSource).toContain('export function projectFileEditorRawSourceDraftPatch')
    expect(modelSource).toContain('export function projectFileEditorRawSourceHydration')
    expect(modelSource).toContain('export function isFileEditorRawSourceDirty')
    expect(modelSource).toContain('export function planFileEditorRawSourceSave')
    expect(modelSource).toContain('export function projectFileEditorRawSourceChrome')
    expect(modelSource).toContain('export function projectFileEditorRawSourceState')
    expect(modelSource).toContain('export function getFileEditorRawSourceResource')
    expect(modelSource).toContain('export function getFileEditorRawSourceSaveErrorMessage')
    expect(modelSource).toContain('export function canSubmitFileEditorRawSourceProposal')
    expect(modelSource).not.toContain('useToast')
    expect(modelSource).not.toContain('useState')
    expect(modelSource).not.toContain('useSaveRawTextResource')
    expect(controllerSource).toContain("from './file-editor-raw-source-model'")
    expect(controllerSource).not.toContain('draft !== rawResource.content')
    expect(controllerSource).not.toContain("useState('')")
    expect(controllerSource).not.toContain('setDraft(projectFileEditorRawSourceDraft(rawResource))')
    expect(controllerSource).not.toContain('error instanceof FilesSaveConflictError')
    expect(controllerSource).not.toContain('!onSubmitAiProposal || !dirty || aiProposalPending')
    expect(controllerSource).not.toContain('onSubmitAiProposal')
    expect(controllerSource).not.toContain('aiProposalPending')
    expect(controllerSource).toContain('onSubmitProposal')
    expect(controllerSource).toContain('proposalPending')
    expect(controllerSource).toContain('projectFileEditorRawSourceChrome')
    expect(featureSource).toContain('rawSource.chrome')
    expect(featureSource).not.toContain('onSubmitAiProposal')
    expect(featureSource).not.toContain('aiProposalPending')
    expect(featureSource).toContain('onSubmitProposal')
    expect(featureSource).toContain('proposalPending')
    expect(featureSource).not.toContain('正在读取完整原始内容')
    expect(featureSource).not.toContain('完整原始内容暂时不可用')
    expect(featureSource).not.toContain('aria-label="原始内容"')
    expect(featureSource).not.toContain('ETag {rawResource.etag}')
    expect(featureSource).not.toContain('proposalLabel =')
    expect(featureSource).not.toContain('`提交 ${proposalLabel}`')
    expect(featureSource).not.toContain("'保存中'")
    expect(featureSource).not.toContain("'保存原始内容'")
  })

  it('projects raw source draft and dirty state', () => {
    const resource = rawResource()

    expect(projectFileEditorRawSourceDraft(resource)).toBe('# Report\n')
    expect(projectFileEditorRawSourceDraft(undefined)).toBe('')
    expect(isFileEditorRawSourceDirty({ rawResource: resource, draft: '# Report\n' })).toBe(false)
    expect(isFileEditorRawSourceDirty({ rawResource: resource, draft: '# Changed\n' })).toBe(true)
    expect(isFileEditorRawSourceDirty({ rawResource: undefined, draft: '# Changed\n' })).toBe(false)
  })

  it('hydrates raw source draft without overwriting local edits on resource refetch', () => {
    const resource = rawResource()
    const initial = createFileEditorRawSourceDraftState(resource)

    expect(initial).toEqual({
      draft: '# Report\n',
      hydratedContent: '# Report\n',
      hydratedResourceSignature: 'https://pod.example/files/report.md\n"etag"\n# Report\n',
    })

    const edited = projectFileEditorRawSourceDraftPatch({
      current: initial,
      draft: '# Local edit\n',
    })
    const sameResourceRefetch = rawResource()
    const sameHydration = projectFileEditorRawSourceHydration({
      current: edited,
      rawResource: sameResourceRefetch,
    })

    expect(sameHydration).toBe(edited)

    const updatedRemote = rawResource({
      content: '# Remote edit\n',
      etag: '"etag-2"',
    })

    expect(projectFileEditorRawSourceHydration({
      current: edited,
      rawResource: updatedRemote,
    })).toEqual({
      draft: '# Local edit\n',
      hydratedContent: '# Remote edit\n',
      hydratedResourceSignature: 'https://pod.example/files/report.md\n"etag-2"\n# Remote edit\n',
    })

    expect(projectFileEditorRawSourceHydration({
      current: initial,
      rawResource: updatedRemote,
    })).toEqual({
      draft: '# Remote edit\n',
      hydratedContent: '# Remote edit\n',
      hydratedResourceSignature: 'https://pod.example/files/report.md\n"etag-2"\n# Remote edit\n',
    })
  })

  it('projects raw source render state without leaking query shape into the editor view', () => {
    const resource = rawResource()

    expect(projectFileEditorRawSourceState({
      rawError: null,
      rawLoading: true,
      rawSourceResource: resource,
    })).toEqual({ kind: 'ready', rawResource: resource })
    expect(projectFileEditorRawSourceState({
      rawError: new Error('HTTP 404'),
      rawLoading: false,
      rawSourceResource: resource,
    })).toEqual({ kind: 'ready', rawResource: resource })
    expect(projectFileEditorRawSourceState({
      rawError: null,
      rawLoading: true,
      rawSourceResource: null,
    })).toEqual({ kind: 'loading' })
    expect(projectFileEditorRawSourceState({
      rawError: new Error('HTTP 404'),
      rawLoading: false,
      rawSourceResource: null,
    })).toEqual({ kind: 'unavailable' })
    expect(projectFileEditorRawSourceState({
      rawError: null,
      rawLoading: false,
      rawSourceResource: null,
    })).toEqual({ kind: 'unavailable' })
    expect(projectFileEditorRawSourceState({
      rawError: null,
      rawLoading: false,
      rawSourceResource: resource,
    })).toEqual({ kind: 'ready', rawResource: resource })

    expect(getFileEditorRawSourceResource({ kind: 'loading' })).toBeUndefined()
    expect(getFileEditorRawSourceResource({ kind: 'unavailable' })).toBeUndefined()
    expect(getFileEditorRawSourceResource({ kind: 'ready', rawResource: resource })).toBe(resource)
  })

  it('projects raw source editor chrome outside the renderer', () => {
    const resource = rawResource()

    expect(projectFileEditorRawSourceChrome({
      sourceState: { kind: 'loading' },
      proposalLabel: undefined,
      savePending: false,
    })).toMatchObject({
      loadingMessage: '正在读取完整原始内容...',
      unavailableMessage: '完整原始内容暂时不可用。',
      contentAriaLabel: '原始内容',
      rawResourceSummary: null,
      proposalSubmitLabel: '提交 AI 修改审批',
      canonicalSaveLabel: '保存原始内容',
    })

    expect(projectFileEditorRawSourceChrome({
      sourceState: { kind: 'ready', rawResource: resource },
      proposalLabel: 'Ingest 审批',
      savePending: true,
    })).toEqual({
      loadingMessage: '正在读取完整原始内容...',
      unavailableMessage: '完整原始内容暂时不可用。',
      contentAriaLabel: '原始内容',
      rawResourceSummary: {
        label: 'text/markdown · ETag "etag"',
        title: 'text/markdown · "etag"',
      },
      proposalSubmitLabel: '提交 Ingest 审批',
      canonicalSaveLabel: '保存中',
    })
  })

  it('plans canonical save payload and proposal readiness', () => {
    const resource = rawResource()

    expect(planFileEditorRawSourceSave({ rawResource: undefined, draft: '# Changed\n' })).toBeNull()
    expect(planFileEditorRawSourceSave({ rawResource: resource, draft: '# Changed\n' })).toEqual({
      resource,
      content: '# Changed\n',
      successMessage: '原始内容已保存',
    })
    expect(canSubmitFileEditorRawSourceProposal({
      hasSubmitHandler: true,
      dirty: true,
      proposalPending: false,
    })).toBe(true)
    expect(canSubmitFileEditorRawSourceProposal({
      hasSubmitHandler: false,
      dirty: true,
      proposalPending: false,
    })).toBe(false)
    expect(canSubmitFileEditorRawSourceProposal({
      hasSubmitHandler: true,
      dirty: false,
      proposalPending: false,
    })).toBe(false)
    expect(canSubmitFileEditorRawSourceProposal({
      hasSubmitHandler: true,
      dirty: true,
      proposalPending: true,
    })).toBe(false)
  })

  it('projects save error copy without controller branching', () => {
    expect(getFileEditorRawSourceSaveErrorMessage(
      new FilesSaveConflictError('https://pod.example/files/report.md'),
    )).toBe('保存冲突：远端内容已变化，请重新读取后再保存。')
    expect(getFileEditorRawSourceSaveErrorMessage(new Error('Network failed'))).toBe('Network failed')
    expect(getFileEditorRawSourceSaveErrorMessage('unknown')).toBe('保存失败')
  })
})
