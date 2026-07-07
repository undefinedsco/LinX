import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const previewPath = 'src/modules/files/features/structured/StructuredTablePreview.tsx'
const controllerPath = 'src/modules/files/features/structured/useStructuredViewMetadataController.ts'
const workflowModelPath = 'src/modules/files/features/structured/structured-view-metadata-workflow-model.ts'
const controllerShimPath = 'src/modules/files/components/useStructuredViewMetadataController.ts'
const viewStateControllerPath = 'src/modules/files/features/structured/useStructuredViewStateController.ts'
const viewStateModelPath = 'src/modules/files/features/structured/structured-view-state-model.ts'
const viewStateControllerShimPath = 'src/modules/files/components/useStructuredViewStateController.ts'

describe('Structured view metadata controller architecture boundary', () => {
  it('keeps view metadata hydration and autosave out of the structured preview container', () => {
    const previewSource = readFileSync(previewPath, 'utf8')

    expect(existsSync(controllerPath)).toBe(true)
    expect(existsSync(workflowModelPath)).toBe(true)
    expect(existsSync(controllerShimPath)).toBe(true)
    expect(existsSync(viewStateControllerPath)).toBe(true)
    expect(existsSync(viewStateModelPath)).toBe(true)
    expect(existsSync(viewStateControllerShimPath)).toBe(true)
    if (!existsSync(controllerPath) || !existsSync(workflowModelPath) || !existsSync(controllerShimPath) || !existsSync(viewStateControllerPath) || !existsSync(viewStateModelPath) || !existsSync(viewStateControllerShimPath)) return

    const controllerSource = readFileSync(controllerPath, 'utf8')
    const workflowModelSource = readFileSync(workflowModelPath, 'utf8')
    const controllerShimSource = readFileSync(controllerShimPath, 'utf8')
    const viewStateControllerSource = readFileSync(viewStateControllerPath, 'utf8')
    const viewStateModelSource = readFileSync(viewStateModelPath, 'utf8')
    const viewStateControllerShimSource = readFileSync(viewStateControllerShimPath, 'utf8')

    expect(previewSource).toContain("from './useStructuredViewStateController'")
    expect(previewSource).not.toContain("from '../../components/useStructuredViewStateController'")
    expect(previewSource).not.toContain("from '../../components/useStructuredViewMetadataController'")
    expect(previewSource).not.toContain('useStructuredViewMetadata(')
    expect(previewSource).not.toContain('useSaveStructuredViewMetadata(')
    expect(previewSource).not.toContain('autosaveReadyRef')
    expect(previewSource).not.toContain('skipNextStructuredViewAutosaveRef')
    expect(previewSource).not.toContain('syncedViewMetadataSignatureRef')
    expect(previewSource).not.toContain('localViewMetadataChangeBeforeHydrationRef')
    expect(previewSource).not.toContain('structuredViewMetadataSignature')
    expect(previewSource).not.toContain("from '../../domain/structured/structured-table'")
    expect(previewSource).not.toContain('projectStructuredClassScope')
    expect(previewSource).not.toContain('resolveEffectiveClassScope')

    expect(controllerSource).toContain('export function useStructuredViewMetadataController')
    expect(controllerSource).toContain('useStructuredViewMetadata')
    expect(controllerSource).toContain('useSaveStructuredViewMetadata')
    expect(controllerSource).toContain('autosaveReadyRef')
    expect(controllerSource).toContain("from './structured-view-metadata-workflow-model'")
    expect(controllerSource).toContain('projectStructuredViewMetadataHydration')
    expect(controllerSource).not.toMatch(/\nfunction sortedRecordEntries\b/)
    expect(controllerSource).not.toMatch(/\nfunction isSameStructuredDocumentUri\b/)
    expect(controllerSource).not.toContain('StructuredTablePreview')
    expect(workflowModelSource).toContain('export function structuredViewMetadataSignature')
    expect(workflowModelSource).toContain('export function projectStructuredViewMetadataHydration')
    expect(workflowModelSource).not.toContain('useState')
    expect(workflowModelSource).not.toContain('useEffect')
    expect(viewStateControllerSource).toContain("from './useStructuredViewMetadataController'")
    expect(viewStateControllerSource).toContain("from './structured-view-state-model'")
    expect(viewStateModelSource).toContain('export function resolveStructuredEffectiveClassScope')
    expect(viewStateModelSource).toContain('projectStructuredClassScope')
    expect(controllerShimSource).toMatch(/^export \* from '..\/features\/structured\/useStructuredViewMetadataController'\n?$/)
    expect(viewStateControllerShimSource).toMatch(/^export \* from '..\/features\/structured\/useStructuredViewStateController'\n?$/)
  })

  it('keeps structured view state store bindings out of the structured preview container', () => {
    const previewSource = readFileSync(previewPath, 'utf8')

    expect(existsSync(viewStateControllerPath)).toBe(true)
    if (!existsSync(viewStateControllerPath)) return

    const viewStateControllerSource = readFileSync(viewStateControllerPath, 'utf8')

    expect(previewSource).toContain("from './useStructuredViewStateController'")
    expect(previewSource).not.toContain("from '../../components/useStructuredViewStateController'")
    expect(previewSource).not.toContain('currentViewMetadata')
    expect(previewSource).not.toContain('markLocalViewMetadataChange')
    expect(previewSource).not.toMatch(/const setStructured[A-Za-z]+FromUi = useCallback/)
    expect(previewSource).not.toMatch(/const setWhiteboard[A-Za-z]+FromUi = useCallback/)
    expect(previewSource).not.toMatch(/const addWhiteboardSubjectFromUi = useCallback/)
    expect(previewSource).not.toMatch(/const removeWhiteboardSubjectFromUi = useCallback/)
    expect(previewSource).not.toMatch(/const clearWhiteboardSubjectsFromUi = useCallback/)

    expect(viewStateControllerSource).toContain('export function useStructuredViewStateController')
    expect(viewStateControllerSource).not.toContain('export function resolveStructuredEffectiveClassScope')
    expect(viewStateControllerSource).not.toContain('projectStructuredClassScope')
    expect(viewStateControllerSource).toContain('resolveStructuredEffectiveClassScope')
    expect(viewStateControllerSource).toContain('useStructuredViewMetadataController')
    expect(viewStateControllerSource).toContain('currentViewMetadata')
    expect(viewStateControllerSource).toContain('markLocalViewMetadataChange')
    expect(viewStateControllerSource).not.toContain('StructuredTablePreview')
  })
})
