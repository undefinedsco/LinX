import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const previewPath = 'src/modules/files/features/structured/StructuredTablePreview.tsx'
const viewStateControllerPath = 'src/modules/files/features/structured/useStructuredViewStateController.ts'
const viewMetadataControllerPath = 'src/modules/files/features/structured/useStructuredViewMetadataController.ts'
const vocabWorkflowControllerPath = 'src/modules/files/features/structured/useStructuredVocabProposalWorkflowController.ts'
const cellWorkflowControllerPath = 'src/modules/files/features/structured/useStructuredCellProposalWorkflowController.ts'

describe('Structured preview effect wiring architecture boundary', () => {
  it('keeps toast notification wiring inside effect workflow owners, not preview composition', () => {
    const previewSource = readFileSync(previewPath, 'utf8')
    const viewStateControllerSource = readFileSync(viewStateControllerPath, 'utf8')
    const viewMetadataControllerSource = readFileSync(viewMetadataControllerPath, 'utf8')
    const vocabWorkflowControllerSource = readFileSync(vocabWorkflowControllerPath, 'utf8')
    const cellWorkflowControllerSource = readFileSync(cellWorkflowControllerPath, 'utf8')

    expect(previewSource).not.toContain("@/components/ui/use-toast")
    expect(previewSource).not.toContain('const { toast } = useToast()')
    expect(previewSource).not.toMatch(/\btoast,\n/)

    expect(viewStateControllerSource).not.toContain("@/components/ui/use-toast")
    expect(viewStateControllerSource).not.toMatch(/\btoast:/)
    expect(viewStateControllerSource).not.toMatch(/\btoast,\n/)

    expect(viewMetadataControllerSource).toContain("@/components/ui/use-toast")
    expect(viewMetadataControllerSource).toContain('const { toast } = useToast()')
    expect(vocabWorkflowControllerSource).toContain("@/components/ui/use-toast")
    expect(vocabWorkflowControllerSource).toContain('const { toast } = useToast()')
    expect(cellWorkflowControllerSource).toContain("@/components/ui/use-toast")
    expect(cellWorkflowControllerSource).toContain('const { toast } = useToast()')
  })
})
