import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const projectionTablePath = 'src/modules/files/features/structured/StructuredProjectionTable.tsx'
const previewPath = 'src/modules/files/features/structured/StructuredTablePreview.tsx'
const projectionActionControllerPath = 'src/modules/files/features/structured/useStructuredProjectionActionController.ts'
const subjectNavigationControllerPath = 'src/modules/files/features/structured/useStructuredSubjectNavigationController.ts'
const subjectPeekModelPath = 'src/modules/files/domain/structured/structured-subject-peek.ts'

describe('Structured subject open target architecture boundary', () => {
  it('keeps subject target resolution in the shared subject peek model', () => {
    const projectionTableSource = readFileSync(projectionTablePath, 'utf8')
    const previewSource = readFileSync(previewPath, 'utf8')
    const projectionActionControllerSource = readFileSync(projectionActionControllerPath, 'utf8')
    const subjectNavigationControllerSource = readFileSync(subjectNavigationControllerPath, 'utf8')
    const modelSource = readFileSync(subjectPeekModelPath, 'utf8')

    expect(projectionTableSource).not.toContain("from '../../domain/structured/structured-subject-peek'")
    expect(projectionTableSource).toContain("from './useStructuredProjectionActionController'")
    expect(projectionActionControllerSource).toContain("from '../../domain/structured/structured-subject-peek'")
    expect(subjectNavigationControllerSource).toContain("from '../../domain/structured/structured-subject-peek'")
    expect(previewSource).not.toContain("from '../../domain/structured/structured-subject-peek'")
    expect(projectionTableSource).not.toContain('resolveStructuredRelationOpenTarget')
    expect(projectionActionControllerSource).toContain('resolveStructuredRelationOpenTarget')
    expect(projectionTableSource).not.toMatch(/\nfunction resolveStructuredSubjectOpenTarget\(/)
    expect(subjectNavigationControllerSource).not.toMatch(/\nfunction resolveStructuredSubjectOpenTarget\(/)
    expect(previewSource).not.toMatch(/\nfunction resolveStructuredSubjectOpenTarget\(/)
    expect(projectionTableSource).not.toContain('resolveStructuredSubjectResourceUri')
    expect(projectionTableSource).not.toContain('resolveStructuredSubjectContainingResourceUri')
    expect(projectionTableSource).not.toContain('function isExternalUrlForDocument')

    expect(modelSource).toContain('export function resolveStructuredSubjectOpenTarget')
    expect(modelSource).toContain('export function resolveStructuredRelationOpenTarget')
    expect(modelSource).toContain('resolveStructuredSourceLinkedCardOpenTarget')
    expect(modelSource).toContain('resolveStructuredSubjectExternalUri')
    expect(modelSource).not.toContain('useFilesStore')
  })
})
