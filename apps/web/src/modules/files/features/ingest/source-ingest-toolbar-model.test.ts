import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import {
  SOURCE_INGEST_KIND_OPTIONS,
  createSourceIngestInitialDraft,
  createSourceIngestToolbarState,
  getSourceIngestCreationErrorMessage,
  parseSourceIngestKind,
  planSourceIngestSubmit,
  projectSourceIngestToolbarDraftPatch,
  projectSourceIngestToolbarKindValue,
  projectSourceIngestToolbarOpenChanged,
  projectSourceIngestToolbarSubmitFailed,
  projectSourceIngestToolbarSubmitStarted,
  projectSourceIngestToolbarSubmitSucceeded,
  projectSourceIngestContainerUri,
  projectSourceIngestToolbarChrome,
  projectSourceIngestToolbarFeedback,
} from './source-ingest-toolbar-model'

const modelPath = 'src/modules/files/features/ingest/source-ingest-toolbar-model.ts'
const controllerPath = 'src/modules/files/features/ingest/useSourceIngestToolbarController.ts'
const featurePath = 'src/modules/files/features/ingest/SourceIngestAction.tsx'

describe('source ingest toolbar model', () => {
  it('keeps Ingest submit and error decisions in a pure model', () => {
    expect(existsSync(modelPath)).toBe(true)
    expect(existsSync(controllerPath)).toBe(true)
    expect(existsSync(featurePath)).toBe(true)
    if (!existsSync(modelPath) || !existsSync(controllerPath) || !existsSync(featurePath)) return

    const modelSource = readFileSync(modelPath, 'utf8')
    const controllerSource = readFileSync(controllerPath, 'utf8')
    const featureSource = readFileSync(featurePath, 'utf8')

    expect(modelSource).toContain('export const SOURCE_INGEST_KIND_OPTIONS')
    expect(modelSource).toContain('export function createSourceIngestInitialDraft')
    expect(modelSource).toContain('export function createSourceIngestToolbarState')
    expect(modelSource).toContain('export function projectSourceIngestToolbarOpenChanged')
    expect(modelSource).toContain('export function projectSourceIngestToolbarDraftPatch')
    expect(modelSource).toContain('export function projectSourceIngestToolbarKindValue')
    expect(modelSource).toContain('export function projectSourceIngestToolbarSubmitStarted')
    expect(modelSource).toContain('export function projectSourceIngestToolbarSubmitSucceeded')
    expect(modelSource).toContain('export function projectSourceIngestToolbarSubmitFailed')
    expect(modelSource).toContain('export function projectSourceIngestContainerUri')
    expect(modelSource).toContain('export function planSourceIngestSubmit')
    expect(modelSource).toContain('export function projectSourceIngestToolbarChrome')
    expect(modelSource).toContain('export function projectSourceIngestToolbarFeedback')
    expect(modelSource).toContain('export function parseSourceIngestKind')
    expect(modelSource).toContain('export function getSourceIngestCreationErrorMessage')
    expect(modelSource).not.toContain('useState')
    expect(modelSource).not.toContain('useFilesStore')
    expect(modelSource).not.toContain('useCreateSourceIngest')
    expect(controllerSource).toContain("from './source-ingest-toolbar-model'")
    expect(controllerSource).not.toContain('const [open, setOpen]')
    expect(controllerSource).not.toContain('useState(false)')
    expect(controllerSource).not.toContain('function sourceCreationErrorMessage')
    expect(controllerSource).not.toContain('createSourceIngestInitialDraft().sourceUri')
    expect(controllerSource).not.toContain('createSourceIngestInitialDraft().title')
    expect(controllerSource).not.toContain('createSourceIngestInitialDraft().sourceKind')
    expect(controllerSource).not.toContain('setCreatedTargetUri')
    expect(controllerSource).not.toContain('setErrorMessage')
    expect(controllerSource).not.toContain('sourceUri.trim() && title.trim()')
    expect(controllerSource).not.toContain('source could not be read')
    expect(featureSource).not.toContain("from '../../domain/source/source-ingest'")
    expect(featureSource).not.toContain('SourceIngestKind')
    expect(featureSource).not.toContain('<option value="url">')
    expect(featureSource).not.toContain('<option value="pdf">')
    expect(featureSource).toContain('ingest.feedback')
    expect(featureSource).not.toContain('ingest.createdTargetUri ?')
    expect(featureSource).not.toContain('ingest.errorMessage && !ingest.open')
    expect(featureSource).not.toContain('ingest.errorMessage ?')
    expect(featureSource).toContain('ingest.chrome')
    expect(featureSource).not.toContain('aria-label="Ingest 来源"')
    expect(featureSource).not.toContain('aria-label="来源类型"')
    expect(featureSource).not.toContain('aria-label="来源地址"')
    expect(featureSource).not.toContain('aria-label="卡片标题"')
    expect(featureSource).not.toContain('placeholder="https://..."')
    expect(featureSource).not.toContain('placeholder="标题"')
    expect(featureSource).not.toContain("'先选文件夹'")
    expect(featureSource).not.toContain("'Ingest 中...'")
    expect(featureSource).not.toContain("'创建 Ingest 卡片'")
  })

  it('projects source kind options, selected container, and default draft', () => {
    expect(SOURCE_INGEST_KIND_OPTIONS).toEqual([
      { value: 'url', label: '网页' },
      { value: 'pdf', label: 'PDF' },
      { value: 'doc', label: 'Word' },
      { value: 'ppt', label: 'PPT' },
    ])
    expect(parseSourceIngestKind('pdf')).toBe('pdf')
    expect(parseSourceIngestKind('unknown')).toBe('url')
    expect(createSourceIngestInitialDraft()).toEqual({
      sourceUri: '',
      title: '',
      sourceKind: 'url',
    })
    expect(projectSourceIngestContainerUri({ kind: 'container', containerUri: 'https://pod.example/files/' })).toBe('https://pod.example/files/')
    expect(projectSourceIngestContainerUri({ kind: 'all' })).toBeNull()
    expect(projectSourceIngestContainerUri({ kind: 'recent' })).toBeNull()
    expect(projectSourceIngestContainerUri({ kind: 'local-workspace', localPath: '/repo' })).toBeNull()
  })

  it('projects draft and feedback state transitions for the toolbar controller', () => {
    const initialState = createSourceIngestToolbarState()

    expect(initialState).toEqual({
      open: false,
      draft: {
        sourceUri: '',
        title: '',
        sourceKind: 'url',
      },
      feedback: {
        createdTargetUri: null,
        errorMessage: null,
      },
    })
    expect(projectSourceIngestToolbarDraftPatch({
      current: initialState,
      patch: { sourceUri: '' },
    })).toBe(initialState)

    const editedState = projectSourceIngestToolbarDraftPatch({
      current: initialState,
      patch: {
        sourceUri: ' https://example.com/report.pdf ',
        title: ' Report ',
      },
    })

    expect(editedState).toEqual({
      open: false,
      draft: {
        sourceUri: ' https://example.com/report.pdf ',
        title: ' Report ',
        sourceKind: 'url',
      },
      feedback: initialState.feedback,
    })
    expect(projectSourceIngestToolbarOpenChanged({ current: editedState, open: true })).toEqual({
      ...editedState,
      open: true,
    })
    expect(projectSourceIngestToolbarKindValue({
      current: editedState,
      value: 'pdf',
    }).draft.sourceKind).toBe('pdf')
    expect(projectSourceIngestToolbarSubmitStarted({
      ...editedState,
      feedback: { createdTargetUri: null, errorMessage: 'old error' },
    })).toEqual({
      ...editedState,
      feedback: { createdTargetUri: null, errorMessage: null },
    })
    expect(projectSourceIngestToolbarSubmitSucceeded({
      current: { ...editedState, open: true },
      targetResourceUri: 'https://pod.example/files/report.card.ttl',
    })).toEqual({
      open: false,
      draft: createSourceIngestInitialDraft(),
      feedback: {
        createdTargetUri: 'https://pod.example/files/report.card.ttl',
        errorMessage: null,
      },
    })
    expect(projectSourceIngestToolbarSubmitFailed({
      current: editedState,
      error: new Error('parser manifest queue unavailable'),
    })).toEqual({
      ...editedState,
      feedback: {
        createdTargetUri: null,
        errorMessage: 'Ingest 队列暂不可用',
      },
    })
  })

  it('plans trimmed submit payload and disabled states', () => {
    expect(planSourceIngestSubmit({
      containerUri: null,
      draft: { sourceUri: ' https://example.com ', title: ' Report ', sourceKind: 'url' },
      isPending: false,
    })).toBeNull()
    expect(planSourceIngestSubmit({
      containerUri: 'https://pod.example/files/',
      draft: { sourceUri: '   ', title: ' Report ', sourceKind: 'url' },
      isPending: false,
    })).toBeNull()
    expect(planSourceIngestSubmit({
      containerUri: 'https://pod.example/files/',
      draft: { sourceUri: ' https://example.com/report.pdf ', title: ' Report ', sourceKind: 'pdf' },
      isPending: true,
    })).toBeNull()
    expect(planSourceIngestSubmit({
      containerUri: 'https://pod.example/files/',
      draft: { sourceUri: ' https://example.com/report.pdf ', title: ' Report ', sourceKind: 'pdf' },
      isPending: false,
    })).toEqual({
      containerUri: 'https://pod.example/files/',
      sourceUri: 'https://example.com/report.pdf',
      title: 'Report',
      sourceKind: 'pdf',
    })
  })

  it('projects creation error copy without controller regex branches', () => {
    expect(getSourceIngestCreationErrorMessage(new Error('source could not be read: 403'))).toBe('Ingest 来源暂不可读')
    expect(getSourceIngestCreationErrorMessage(new Error('parser manifest queue unavailable'))).toBe('Ingest 队列暂不可用')
    expect(getSourceIngestCreationErrorMessage(new Error('other'))).toBe('Ingest 创建失败')
    expect(getSourceIngestCreationErrorMessage('unknown')).toBe('Ingest 创建失败')
  })

  it('projects toolbar success and error feedback outside the renderer', () => {
    expect(projectSourceIngestToolbarFeedback({
      createdTargetUri: null,
      errorMessage: null,
      open: false,
    })).toEqual({
      closedError: null,
      formError: null,
      success: null,
    })

    expect(projectSourceIngestToolbarFeedback({
      createdTargetUri: 'https://pod.example/files/report.card.ttl',
      errorMessage: null,
      open: false,
    })).toEqual({
      closedError: null,
      formError: null,
      success: {
        message: '已创建 Ingest 卡片',
        targetUri: 'https://pod.example/files/report.card.ttl',
      },
    })

    expect(projectSourceIngestToolbarFeedback({
      createdTargetUri: null,
      errorMessage: 'Ingest 队列暂不可用',
      open: true,
    })).toEqual({
      closedError: null,
      formError: 'Ingest 队列暂不可用',
      success: null,
    })

    expect(projectSourceIngestToolbarFeedback({
      createdTargetUri: null,
      errorMessage: 'Ingest 队列暂不可用',
      open: false,
    })).toEqual({
      closedError: 'Ingest 队列暂不可用',
      formError: 'Ingest 队列暂不可用',
      success: null,
    })
  })

  it('projects form chrome from workflow state outside the renderer', () => {
    expect(projectSourceIngestToolbarChrome({
      containerUri: null,
      isPending: false,
    })).toEqual({
      triggerLabel: 'Ingest 来源',
      sourceKindLabel: '来源类型',
      sourceUriLabel: '来源地址',
      sourceUriPlaceholder: 'https://...',
      titleLabel: '卡片标题',
      titlePlaceholder: '标题',
      containerLabel: '先选文件夹',
      submitLabel: '创建 Ingest 卡片',
    })

    expect(projectSourceIngestToolbarChrome({
      containerUri: 'https://pod.example/files/',
      isPending: true,
    })).toMatchObject({
      containerLabel: 'https://pod.example/files/',
      submitLabel: 'Ingest 中...',
    })
  })
})
