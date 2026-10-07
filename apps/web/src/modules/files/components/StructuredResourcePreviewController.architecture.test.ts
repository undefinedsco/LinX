import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const previewPath = 'src/modules/files/features/structured/StructuredTablePreview.tsx'
const controllerPath = 'src/modules/files/features/structured/useStructuredResourcePreviewController.ts'
const modelPath = 'src/modules/files/features/structured/structured-resource-preview-model.ts'

describe('Structured resource preview controller architecture boundary', () => {
  it('keeps structured write capability decisions out of the preview composition', () => {
    const previewSource = readFileSync(previewPath, 'utf8')

    expect(existsSync(controllerPath)).toBe(true)
    expect(existsSync(modelPath)).toBe(true)
    if (!existsSync(controllerPath) || !existsSync(modelPath)) return

    const controllerSource = readFileSync(controllerPath, 'utf8')
    const modelSource = readFileSync(modelPath, 'utf8')

    expect(previewSource).toContain("from './useStructuredResourcePreviewController'")
    expect(previewSource).not.toContain("from '../../domain/structured/structured-write-capability'")
    expect(previewSource).not.toContain('supportsStructuredWriteProposals')

    expect(controllerSource).toContain('supportsStructuredWriteProposals')
    expect(controllerSource).toContain('structuredWritesSupported')
    expect(controllerSource).toContain("from './structured-resource-preview-model'")
    expect(controllerSource).not.toContain('buildStructuredVocabDefinitionIndex')
    expect(controllerSource).not.toContain('projectLockedVocabRegistryRows')
    expect(controllerSource).not.toMatch(/\nfunction structuredSourceForFile\b/)
    expect(modelSource).toContain('export function projectStructuredResourcePreviewSource')
    expect(modelSource).toContain('export function projectStructuredResourcePreviewVocabUris')
    expect(modelSource).toContain('export function projectStructuredResourcePreviewVocabDefinitionIndex')
    expect(modelSource).not.toContain('useState')
    expect(modelSource).not.toContain('useEffect')
  })
})
