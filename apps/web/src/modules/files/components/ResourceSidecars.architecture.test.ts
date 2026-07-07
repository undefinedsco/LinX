import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const sidecarsPath = 'src/modules/files/features/sidecars/ResourceSidecars.tsx'
const accessDialogControllerPath = 'src/modules/files/features/sidecars/useAccessPolicyDialogController.ts'
const metaDrawerControllerPath = 'src/modules/files/features/sidecars/useResourceMetaDrawerController.ts'
const metaSidecarContentControllerPath = 'src/modules/files/features/sidecars/useResourceMetaSidecarContentController.ts'
const metaSidecarContentModelPath = 'src/modules/files/features/sidecars/resource-meta-sidecar-content-model.ts'
const sidecarActionsControllerPath = 'src/modules/files/features/sidecars/useResourceSidecarActionsController.ts'
const sidecarsShimPath = 'src/modules/files/components/ResourceSidecars.tsx'
const accessDialogModelPath = 'src/modules/files/domain/resource/access-policy-dialog-model.ts'
const accessDialogModelRootShimPath = 'src/modules/files/access-policy-dialog-model.ts'
const sidecarsConsumers = [
  ['src/modules/files/features/detail/FileDetailPane.tsx', '../sidecars/ResourceSidecars'],
  ['src/modules/files/features/editor/FileEditorSheet.tsx', '../sidecars/ResourceSidecars'],
  ['src/modules/files/features/folder/FolderChildPreview.tsx', '../sidecars/ResourceSidecars'],
  ['src/modules/files/features/structured/StructuredSubjectPeekActions.tsx', '../sidecars/ResourceSidecars'],
] as const
const sidecarsIndirectConsumers = [
  'src/modules/files/features/structured/StructuredTablePreview.tsx',
  'src/modules/files/features/structured/LockedVocabTablePreview.tsx',
] as const

function sourceSection(source: string, start: string, end: string) {
  const startIndex = source.indexOf(start)
  const endIndex = source.indexOf(end, startIndex)
  if (startIndex === -1 || endIndex === -1) return ''
  return source.slice(startIndex, endIndex)
}

describe('Resource sidecars architecture boundary', () => {
  it('keeps sidecar workflow in features while pure access proposal targeting stays in domain/resource', () => {
    expect(existsSync(sidecarsPath)).toBe(true)
    expect(existsSync(accessDialogControllerPath)).toBe(true)
    expect(existsSync(metaDrawerControllerPath)).toBe(true)
    expect(existsSync(metaSidecarContentControllerPath)).toBe(true)
    expect(existsSync(metaSidecarContentModelPath)).toBe(true)
    expect(existsSync(sidecarActionsControllerPath)).toBe(true)
    expect(existsSync(sidecarsShimPath)).toBe(true)
    if (!existsSync(sidecarsPath) || !existsSync(accessDialogControllerPath) || !existsSync(metaDrawerControllerPath) || !existsSync(metaSidecarContentControllerPath) || !existsSync(metaSidecarContentModelPath) || !existsSync(sidecarActionsControllerPath) || !existsSync(sidecarsShimPath)) return

    const sidecarsSource = readFileSync(sidecarsPath, 'utf8')
    const controllerSource = readFileSync(accessDialogControllerPath, 'utf8')
    const metaDrawerControllerSource = readFileSync(metaDrawerControllerPath, 'utf8')
    const metaSidecarContentControllerSource = readFileSync(metaSidecarContentControllerPath, 'utf8')
    const metaSidecarContentModelSource = readFileSync(metaSidecarContentModelPath, 'utf8')
    const sidecarActionsControllerSource = readFileSync(sidecarActionsControllerPath, 'utf8')
    const sidecarsShimSource = readFileSync(sidecarsShimPath, 'utf8')

    expect(existsSync(accessDialogModelPath)).toBe(true)
    expect(existsSync(accessDialogModelRootShimPath)).toBe(true)
    if (!existsSync(accessDialogModelPath) || !existsSync(accessDialogModelRootShimPath)) return

    const modelSource = readFileSync(accessDialogModelPath, 'utf8')
    const rootShimSource = readFileSync(accessDialogModelRootShimPath, 'utf8')

    expect(sidecarsSource).not.toContain("from '../../domain/resource/access-policy-dialog-model'")
    expect(sidecarsSource).toContain("from './useAccessPolicyDialogController'")
    expect(sidecarsSource).toContain("from './useResourceMetaDrawerController'")
    expect(sidecarsSource).toContain("from './useResourceMetaSidecarContentController'")
    expect(sidecarsSource).toContain("from './useResourceSidecarActionsController'")
    expect(sidecarsSource).toContain('useAccessPolicyDialogController')
    expect(sidecarsSource).toContain('useResourceMetaDrawerController')
    expect(sidecarsSource).toContain('useResourceMetaSidecarContentController')
    expect(sidecarsSource).toContain('useResourceSidecarActionsController')
    expect(sidecarsSource).toContain('accessDialog.currentAccessSourceState')
    expect(sidecarsSource).not.toContain("from '../../access-policy-dialog-model'")
    expect(sidecarsSource).not.toContain("from '../../access-approval'")
    expect(sidecarsSource).not.toContain("from '../../data/queries'")
    expect(sidecarsSource).not.toContain('useFilesMetaSidecar')
    expect(sidecarsSource).not.toContain('useFilesAccessBasics')
    expect(sidecarsSource).not.toContain('usePendingAccessPolicyProposals')
    expect(sidecarsSource).not.toContain('useCreateAccessPolicyProposal')
    expect(sidecarsSource).not.toContain('useToast')
    expect(sidecarsSource).not.toContain('getFileMetaRows')
    expect(sidecarsSource).not.toContain('getFolderMetaRows')
    expect(sidecarsSource).not.toContain('getMetaSidecarRows')
    expect(sidecarsSource).not.toContain('summarizeMetaSidecarContent')
    expect(sidecarsSource).not.toContain('summarizeWorkspaceMetaSidecarContent')
    expect(sidecarsSource).not.toContain('omitAccessPolicyFactsFromMetaText')
    expect(sidecarsSource).not.toContain('localizeMetaRows')
    expect(sidecarsSource).not.toContain('openFilesExternalUri')
    expect(sidecarsSource).not.toContain('createAccessPolicyDialogProposal')
    expect(sidecarsSource).not.toContain('pendingAccessProposalFromProposal')
    expect(sidecarsSource).not.toContain('mergePendingAccessProposals')
    expect(sidecarsSource).not.toContain('resolveAccessProposalPolicyTarget')
    expect(sidecarsSource).not.toContain('canCreateAccessPolicyDialogProposal')
    expect(sidecarsSource).not.toContain('getCurrentPodPolicyView')
    expect(sidecarsSource).not.toContain('getAccessProposalHelp')
    expect(sidecarsSource).not.toContain('isAccessDialogAgentWebIdInvalid')
    expect(sidecarsSource).not.toContain('.candidates.find')
    expect(sidecarsSource).not.toContain('grants.find')
    expect(sidecarsSource).not.toContain('grants.filter')
    expect(sidecarsSource).not.toContain('ACCESS_PROVIDER_LABELS')
    expect(sidecarsSource).not.toContain('AccessAudience')
    expect(sidecarsSource).not.toContain('AccessRole')
    expect(sidecarsSource).not.toContain('accessDialog.accessQuery')
    expect(sidecarsSource).not.toContain('accessDialog.accessErrorMessage')
    expect(sidecarsSource).not.toMatch(/accessDialog\.currentAccessSource(?!State)/)
    expect(sidecarsSource).not.toContain('<option value="public">')
    expect(sidecarsSource).not.toContain('<option value="viewer">')
    expect(sidecarsSource).not.toContain('function formatAccessModes')
    expect(sidecarsSource).not.toContain('function formatAccessLine')
    expect(sidecarsSource).not.toContain('resolveFilesSidecarOwnerTarget')
    expect(sidecarsSource).not.toContain('resolveFilesResourceSidecars')
    expect(sidecarsSource).not.toContain('query: ResourceMetaSidecarQuery')
    expect(sidecarsSource).not.toContain('<ResourceMetaSidecarContent file=')
    expect(sidecarsSource).not.toContain('setAccessOpen')
    expect(sidecarsSource).not.toContain('folderRows.length')
    expect(sidecarsSource).not.toContain('semanticRows.length')
    expect(sidecarsSource).not.toContain('workspaceRows.length')
    expect(sidecarsSource).not.toContain('displayedPendingProposals.length')
    expect(sidecarsSource).not.toContain('content.rawContentAvailable')
    expect(sidecarsSource).not.toContain('content.metaState')
    expect(sidecarsSource).toContain('content.rawPanel')
    expect(sidecarsSource).toContain('showFolderRows')
    expect(sidecarsSource).toContain('showSemanticRows')
    expect(sidecarsSource).toContain('showWorkspaceRows')
    expect(sidecarsSource).toContain('hasDisplayedPendingProposals')
    expect(sidecarsSource).not.toMatch(/const \[accessOpen,\s*setAccessOpen\]/)
    expect(controllerSource).toContain('export function useAccessPolicyDialogController')
    expect(controllerSource).toContain('useFilesAccessBasics')
    expect(controllerSource).toContain('usePendingAccessPolicyProposals')
    expect(controllerSource).toContain('useCreateAccessPolicyProposal')
    expect(controllerSource).toContain('useToast')
    expect(controllerSource).toContain('openFilesExternalUri')
    expect(controllerSource).toContain('createAccessPolicyDialogControllerState')
    expect(controllerSource).toContain('createAccessPolicyDialogProposal')
    expect(controllerSource).toContain('projectAccessPolicyDialogControllerAudienceValue')
    expect(controllerSource).toContain('projectAccessPolicyDialogControllerProposalCreated')
    expect(controllerSource).toContain('projectAccessPolicyDialogControllerRoleValue')
    expect(controllerSource).toContain('projectAccessPolicyDialogDraftPatch')
    expect(controllerSource).toContain('mergePendingAccessProposals')
    expect(controllerSource).toContain('hasDisplayedPendingProposals')
    expect(controllerSource).toContain('projectAccessQueryErrorMessage')
    expect(controllerSource).toContain('projectCurrentAccessSourceState')
    expect(controllerSource).not.toContain('const [audience, setAudience]')
    expect(controllerSource).not.toContain('const [role, setRole]')
    expect(controllerSource).not.toContain('const [agentWebId, setAgentWebId]')
    expect(controllerSource).not.toContain('const [reason, setReason]')
    expect(controllerSource).not.toContain('const [pendingProposals, setPendingProposals]')
    expect(controllerSource).not.toContain('setPendingProposals((current) => [')
    expect(controllerSource).not.toContain("if (audience === 'agent')")
    expect(controllerSource).not.toContain('formatAccessQueryError')
    expect(controllerSource).toContain('openCurrentAccessSource')
    expect(controllerSource).toContain('canOpenCurrentAccessSource')
    expect(controllerSource).toContain('ACCESS_AUDIENCE_OPTIONS')
    expect(controllerSource).toContain('ACCESS_ROLE_OPTIONS')
    expect(controllerSource).not.toContain('parseAccessAudience')
    expect(controllerSource).not.toContain('parseAccessRole')
    expect(controllerSource).not.toContain('DialogContent')
    expect(controllerSource).not.toMatch(/\nfunction AccessMatrix\(/)
    expect(controllerSource).not.toContain('<AccessMatrix')
    expect(metaDrawerControllerSource).toContain('export function useResourceMetaDrawerController')
    expect(metaDrawerControllerSource).toContain('useFilesMetaSidecar')
    expect(metaDrawerControllerSource).not.toContain('SidecarDrawer')
    expect(metaDrawerControllerSource).not.toContain('ResourceMetaSidecarContent')
    expect(metaSidecarContentControllerSource).toContain('export function useResourceMetaSidecarContentController')
    expect(metaSidecarContentControllerSource).toContain("from './resource-meta-sidecar-content-model'")
    expect(metaSidecarContentControllerSource).not.toContain('getFolderMetaRows')
    expect(metaSidecarContentControllerSource).not.toContain('getMetaSidecarRows')
    expect(metaSidecarContentControllerSource).not.toContain('summarizeMetaSidecarContent')
    expect(metaSidecarContentControllerSource).not.toContain('summarizeWorkspaceMetaSidecarContent')
    expect(metaSidecarContentControllerSource).not.toContain('folderRows.length')
    expect(metaSidecarContentControllerSource).not.toContain('semanticRows.length')
    expect(metaSidecarContentControllerSource).not.toContain('workspaceRows.length')
    expect(metaSidecarContentModelSource).toContain('export function projectResourceMetaSidecarContent')
    expect(metaSidecarContentModelSource).toContain('getFileMetaRows')
    expect(metaSidecarContentModelSource).toContain('getFolderMetaRows')
    expect(metaSidecarContentModelSource).toContain('getMetaSidecarRows')
    expect(metaSidecarContentModelSource).toContain('summarizeMetaSidecarContent')
    expect(metaSidecarContentModelSource).toContain('summarizeWorkspaceMetaSidecarContent')
    expect(metaSidecarContentModelSource).toContain('showFolderRows')
    expect(metaSidecarContentModelSource).toContain('showSemanticRows')
    expect(metaSidecarContentModelSource).toContain('showWorkspaceRows')
    expect(metaSidecarContentModelSource).toContain('rawPanel')
    expect(metaSidecarContentModelSource).not.toContain('useFilesMetaSidecar')
    expect(metaSidecarContentControllerSource).not.toContain('SidecarDrawer')
    expect(metaSidecarContentControllerSource).not.toContain('<MetaRows')
    expect(metaSidecarContentControllerSource).not.toMatch(/\nfunction ResourceMetaSidecarContent\(/)
    expect(sidecarActionsControllerSource).toContain('export function useResourceSidecarActionsController')
    expect(sidecarActionsControllerSource).toContain('resolveFilesSidecarOwnerTarget')
    expect(sidecarActionsControllerSource).toContain('resolveFilesResourceSidecars')
    expect(sidecarActionsControllerSource).not.toMatch(/function AccessPolicyDialog\b/)
    expect(sidecarActionsControllerSource).not.toContain('<AccessPolicyDialog')
    expect(sidecarActionsControllerSource).not.toContain('<Button')
    expect(sidecarsSource).not.toMatch(/function pendingAccessProposalFromProposal\b/)
    expect(sidecarsSource).not.toMatch(/function mergePendingAccessProposals\b/)
    expect(sidecarsSource).not.toContain('candidateInheritedAcrSource')
    expect(sidecarsSource).not.toContain('candidateAclSource')

    expect(modelSource).toContain('export function resolveAccessProposalPolicyTarget')
    expect(modelSource).toContain('export function getCurrentAccessSourceView')
    expect(modelSource).toContain('export function getAccessPolicySourceRows')
    expect(modelSource).toContain('export function getAccessMatrixRows')
    expect(modelSource).toContain('export function projectAccessQueryErrorMessage')
    expect(modelSource).toContain('export function projectCurrentAccessSourceState')
    expect(modelSource).toContain('export const ACCESS_AUDIENCE_OPTIONS')
    expect(modelSource).toContain('export const ACCESS_ROLE_OPTIONS')
    expect(modelSource).toContain('export function parseAccessAudience')
    expect(modelSource).toContain('export function parseAccessRole')
    expect(modelSource).toContain('export function createAccessPolicyDialogProposal')
    expect(modelSource).toContain('export function createAccessPolicyDialogControllerState')
    expect(modelSource).toContain('export function projectAccessPolicyDialogControllerAudienceValue')
    expect(modelSource).toContain('export function projectAccessPolicyDialogControllerProposalCreated')
    expect(modelSource).toContain('export function projectAccessPolicyDialogControllerRoleValue')
    expect(modelSource).toContain('export function projectAccessPolicyDialogDraftPatch')
    expect(modelSource).toContain('export function projectStagedPendingAccessProposals')
    expect(modelSource).toContain('export function projectAccessPolicyDialogStateAfterProposalCreate')
    expect(modelSource).toContain('createAccessPolicyProposal')
    expect(modelSource).toContain("from '../proposal/access-approval-model'")
    expect(modelSource).toContain("from './resource-model'")
    expect(modelSource).toContain("from './resource-semantics'")
    expect(modelSource).not.toContain('useState')
    expect(modelSource).not.toContain('useToast')
    expect(modelSource).not.toContain('<Dialog')
    expect(modelSource).not.toContain('<Button')
    expect(sidecarsShimSource).toMatch(/^export \* from '..\/features\/sidecars\/ResourceSidecars'\n?$/)
    expect(rootShimSource).toMatch(/^export \* from '.\/domain\/resource\/access-policy-dialog-model'\n?$/)

    for (const [consumerPath, expectedImport] of sidecarsConsumers) {
      const consumerSource = readFileSync(consumerPath, 'utf8')
      expect(consumerSource, `${consumerPath} should import ResourceSidecars from the feature owner`).toContain(`from '${expectedImport}'`)
      expect(consumerSource, `${consumerPath} should not import ResourceSidecars from components shim`).not.toContain("from '../../components/ResourceSidecars'")
    }
    for (const consumerPath of sidecarsIndirectConsumers) {
      const consumerSource = readFileSync(consumerPath, 'utf8')
      expect(consumerSource, `${consumerPath} should use structured peek actions instead of sidecar workflow directly`).toContain("from './StructuredSubjectPeekActions'")
      expect(consumerSource, `${consumerPath} should not import ResourceSidecars directly`).not.toContain("from '../sidecars/ResourceSidecars'")
      expect(consumerSource, `${consumerPath} should not import ResourceSidecars from components shim`).not.toContain("from '../../components/ResourceSidecars'")
    }
  })

  it('keeps policy source row browser open delegated to the access dialog owner', () => {
    expect(existsSync(sidecarsPath)).toBe(true)
    if (!existsSync(sidecarsPath)) return

    const sidecarsSource = readFileSync(sidecarsPath, 'utf8')
    const controllerSource = readFileSync(accessDialogControllerPath, 'utf8')
    const rowSource = sourceSection(
      sidecarsSource,
      'function PolicySourceRow',
      'export function ResourceSidecarActions',
    )

    expect(rowSource).toContain('onOpenPolicySource')
    expect(rowSource).not.toContain('window.open')
    expect(sidecarsSource).toContain('onOpenPolicySource={accessDialog.openPolicySource}')
    expect(controllerSource).toContain('function openPolicySource')
    expect(controllerSource).toContain('openFilesExternalUri')
  })

  it('keeps editor meta tail independent from data hook query shape', () => {
    const editorMetaTailPath = 'src/modules/files/features/editor/FileEditorSheetMetaTail.tsx'

    expect(existsSync(editorMetaTailPath)).toBe(true)
    if (!existsSync(editorMetaTailPath)) return

    const editorMetaTailSource = readFileSync(editorMetaTailPath, 'utf8')

    expect(editorMetaTailSource).not.toContain('useFilesMetaSidecar')
    expect(editorMetaTailSource).not.toContain('ReturnType<typeof')
    expect(editorMetaTailSource).not.toContain('query.data')
    expect(editorMetaTailSource).toContain('content.meta')
  })
})
