import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const domainRootPath = 'src/modules/files/domain'
const resourceModelPath = 'src/modules/files/domain/resource/resource-model.ts'
const resourceSemanticsModelPath = 'src/modules/files/domain/resource/resource-semantics.ts'
const rootResourceSemanticsShimPath = 'src/modules/files/resource-semantics.ts'
const filesRdfContractPath = 'src/modules/files/domain/resource/files-rdf-contract.ts'
const rootFilesRdfContractShimPath = 'src/modules/files/files-rdf-contract.ts'
const filesErrorStateModelPath = 'src/modules/files/domain/resource/files-error-state.ts'
const rootFilesErrorStateShimPath = 'src/modules/files/files-error-state.ts'
const structuredSubjectUriModelPath = 'src/modules/files/domain/resource/structured-subject-uri.ts'
const accessPolicyModelPath = 'src/modules/files/domain/resource/access-policy-model.ts'
const treeModelPath = 'src/modules/files/domain/resource/tree-model.ts'
const folderChildOpenModelPath = 'src/modules/files/domain/folder/folder-child-open.ts'
const rootFolderChildOpenShimPath = 'src/modules/files/folder-child-open.ts'
const folderDetailPreviewFeaturePath = 'src/modules/files/features/folder/FolderDetailPreview.tsx'
const filesListPaneFeaturePath = 'src/modules/files/features/list/FilesListPane.tsx'
const filesListPaneControllerFeaturePath = 'src/modules/files/features/list/useFilesListPaneController.ts'
const filesListOperationControllerFeaturePath = 'src/modules/files/features/list/useFilesListOperationController.ts'
const filesListOperationModelPath = 'src/modules/files/domain/list/files-list-operation-model.ts'
const fileDetailPaneControllerFeaturePath = 'src/modules/files/features/detail/useFileDetailPaneController.ts'
const fileDetailPaneModelFeaturePath = 'src/modules/files/features/detail/file-detail-pane-model.ts'
const folderDetailNavigationControllerFeaturePath = 'src/modules/files/features/folder/useFolderDetailNavigationController.ts'
const folderNavigationWorkflowModelFeaturePath = 'src/modules/files/features/folder/folder-navigation-workflow-model.ts'
const folderDetailChildViewsFeaturePath = 'src/modules/files/features/folder/FolderDetailChildViews.tsx'
const folderDetailColumnViewFeaturePath = 'src/modules/files/features/folder/FolderDetailColumnView.tsx'
const listProjectionModelPath = 'src/modules/files/domain/list/list-projection.ts'
const rootListProjectionShimPath = 'src/modules/files/list-projection.ts'
const chatFilesProjectionModelPath = 'src/modules/files/domain/list/chat-files-projection.ts'
const rootChatFilesProjectionShimPath = 'src/modules/files/chat-files-projection.ts'
const structuredTableDomainPath = 'src/modules/files/domain/structured/structured-table.ts'
const structuredViewMetadataPath = 'src/modules/files/domain/structured/structured-view-metadata.ts'
const rootStructuredViewMetadataShimPath = 'src/modules/files/structured-view-metadata.ts'
const sourceIngestManifestPath = 'src/modules/files/domain/source/source-ingest-manifest.ts'
const rootSourceIngestManifestShimPath = 'src/modules/files/source-ingest-manifest.ts'
const sourceIngestModelPath = 'src/modules/files/domain/source/source-ingest.ts'
const rootSourceIngestShimPath = 'src/modules/files/source-ingest.ts'
const proposalRdfPath = 'src/modules/files/domain/proposal/proposal-rdf.ts'
const rootProposalRdfShimPath = 'src/modules/files/proposal-rdf.ts'
const proposalStatusModelPath = 'src/modules/files/domain/proposal/proposal-status.ts'
const rootProposalStatusPath = 'src/modules/files/proposal-status.ts'
const accessApprovalModelPath = 'src/modules/files/domain/proposal/access-approval-model.ts'
const rootAccessApprovalPath = 'src/modules/files/access-approval.ts'
const accessPolicyProposalUseCasesPath = 'src/modules/files/data/proposal/access-policy-proposal-use-cases.ts'
const accessPolicyDialogModelPath = 'src/modules/files/domain/resource/access-policy-dialog-model.ts'
const rootAccessPolicyDialogModelShimPath = 'src/modules/files/access-policy-dialog-model.ts'
const aiChangeApprovalModelPath = 'src/modules/files/domain/proposal/ai-change-approval-model.ts'
const rootAiChangeApprovalPath = 'src/modules/files/ai-change-approval.ts'
const aiChangeProposalUseCasesPath = 'src/modules/files/data/proposal/ai-change-proposal-use-cases.ts'
const filesCollectionsPath = 'src/modules/files/data/collections/index.ts'
const resourceCollectionPath = 'src/modules/files/data/collections/resource-collection.ts'
const proposalCollectionsPath = 'src/modules/files/data/collections/proposal-collections.ts'
const filesQueriesPath = 'src/modules/files/data/queries/index.ts'
const proposalQueriesPath = 'src/modules/files/data/queries/proposal-queries.ts'
const fileEditorSheetControllerFeaturePath = 'src/modules/files/features/editor/useFileEditorSheetController.ts'
const structuredCellApprovalModelPath = 'src/modules/files/domain/proposal/structured-cell-approval-model.ts'
const rootStructuredCellApprovalPath = 'src/modules/files/structured-cell-approval.ts'
const structuredCellProposalUseCasesPath = 'src/modules/files/data/proposal/structured-cell-proposal-use-cases.ts'
const structuredTablePreviewFeaturePath = 'src/modules/files/features/structured/StructuredTablePreview.tsx'
const structuredCellProposalWorkflowControllerFeaturePath = 'src/modules/files/features/structured/useStructuredCellProposalWorkflowController.ts'
const fileDetailMetadataPanelsFeaturePath = 'src/modules/files/features/detail/FileDetailMetadataPanels.tsx'
const detailMetaPredicateControllerFeaturePath = 'src/modules/files/features/detail/useDetailMetaPredicateController.ts'
const detailMetadataEditorModelPath = 'src/modules/files/domain/detail/detail-metadata-editor-model.ts'
const rootDetailMetadataEditorModelShimPath = 'src/modules/files/detail-metadata-editor-model.ts'
const structuredTableCellModelDomainPath = 'src/modules/files/domain/structured/structured-table-cell-model.ts'
const rootVocabApprovalPath = 'src/modules/files/vocab-approval.ts'
const sourceApprovalModelPath = 'src/modules/files/domain/source/source-approval-model.ts'
const rootSourceApprovalPath = 'src/modules/files/source-approval.ts'
const podAdapterPath = 'src/modules/files/data/pod-adapter/index.ts'
const forbiddenDomainDependencyPatterns = [
  /from\s+['"]react['"]/,
  /from\s+['"][^'"]*(?:\.\.\/)+queries(?:['"]|\/)/,
  /from\s+['"][^'"]*(?:\.\.\/)+collections(?:['"]|\/)/,
  /from\s+['"][^'"]*(?:\.\.\/)+store(?:['"]|\/)/,
  /from\s+['"][^'"]*(?:\.\.\/)+browser(?:['"]|\/)/,
  /from\s+['"]@\/modules\/files\/(?:queries|collections|store|browser)(?:['"]|\/)/,
  /from\s+['"]@tanstack\/react-query['"]/,
  /from\s+['"]@tanstack\/react-db['"]/,
  /from\s+['"]zustand['"]/,
  /from\s+['"]@\/providers\/solid-database-provider['"]/,
  /from\s+['"]@\/lib\/data\/current-pod-base['"]/,
]

function listSourceFiles(rootPath: string): string[] {
  if (!existsSync(rootPath)) return []

  return readdirSync(rootPath).flatMap((entryName) => {
    const entryPath = `${rootPath}/${entryName}`
    if (statSync(entryPath).isDirectory()) return listSourceFiles(entryPath)
    if (!/\.(ts|tsx)$/.test(entryName) || /\.test\.(ts|tsx)$/.test(entryName)) return []
    return [entryPath]
  })
}

function readImportBlock(source: string, importSource: string): string {
  const escapedImportSource = importSource.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const importMatch = source.match(new RegExp(`import\\s+\\{(?:(?!\\nimport\\s)[\\s\\S])*?\\}\\s+from\\s+['"]${escapedImportSource}['"]`))
  return importMatch?.[0] ?? ''
}

describe('Files domain boundary', () => {
  it('keeps Files resource models in the domain/resource layer instead of the Pod adapter', () => {
    expect(existsSync(resourceModelPath)).toBe(true)
    if (!existsSync(resourceModelPath)) return

    const resourceModelSource = readFileSync(resourceModelPath, 'utf8')
    const podAdapterSource = readFileSync(podAdapterPath, 'utf8')

    expect(resourceModelSource).toContain('export interface FilesEntry')
    expect(resourceModelSource).toContain('export interface FilesDetail')
    expect(resourceModelSource).toContain('export class FilesResourceReadError')
    expect(podAdapterSource).toContain("from '../../domain/resource/resource-model'")
    expect(podAdapterSource).not.toMatch(/\nexport interface FilesEntry\b/)
    expect(podAdapterSource).not.toMatch(/\nexport interface FilesDetail\b/)
    expect(podAdapterSource).not.toMatch(/\nexport class FilesResourceReadError\b/)
  })

  it('keeps Files resource semantic decisions in domain/resource with a root compatibility shim', () => {
    expect(existsSync(resourceSemanticsModelPath)).toBe(true)
    expect(existsSync(rootResourceSemanticsShimPath)).toBe(true)
    if (!existsSync(resourceSemanticsModelPath) || !existsSync(rootResourceSemanticsShimPath)) return

    const semanticsSource = readFileSync(resourceSemanticsModelPath, 'utf8')
    const rootShimSource = readFileSync(rootResourceSemanticsShimPath, 'utf8')

    expect(semanticsSource).toContain('export function classifyFilesEntry')
    expect(semanticsSource).toContain('export function resolveFilesResourceSidecars')
    expect(rootShimSource).toMatch(/^export \* from '.\/domain\/resource\/resource-semantics'\n?$/)
  })

  it('keeps Files RDF and sidecar path contracts in domain/resource with a root compatibility shim', () => {
    expect(existsSync(filesRdfContractPath)).toBe(true)
    expect(existsSync(rootFilesRdfContractShimPath)).toBe(true)
    if (!existsSync(filesRdfContractPath) || !existsSync(rootFilesRdfContractShimPath)) return

    const contractSource = readFileSync(filesRdfContractPath, 'utf8')
    const rootShimSource = readFileSync(rootFilesRdfContractShimPath, 'utf8')

    expect(contractSource).toContain('export function resolveFilesPodRootUri')
    expect(contractSource).toContain('export function filesAppMetaResourceUri')
    expect(contractSource).toContain('export function isFilesReservedResourceUri')
    expect(rootShimSource).toMatch(/^export \* from '.\/domain\/resource\/files-rdf-contract'\n?$/)
  })

  it('keeps Files resource read error projections in domain/resource with a root compatibility shim', () => {
    expect(existsSync(filesErrorStateModelPath)).toBe(true)
    expect(existsSync(rootFilesErrorStateShimPath)).toBe(true)
    if (!existsSync(filesErrorStateModelPath) || !existsSync(rootFilesErrorStateShimPath)) return

    const errorStateSource = readFileSync(filesErrorStateModelPath, 'utf8')
    const rootShimSource = readFileSync(rootFilesErrorStateShimPath, 'utf8')
    const listPaneControllerSource = readFileSync(filesListPaneControllerFeaturePath, 'utf8')
    const detailPaneControllerSource = readFileSync(fileDetailPaneControllerFeaturePath, 'utf8')
    const detailPaneModelSource = readFileSync(fileDetailPaneModelFeaturePath, 'utf8')

    expect(errorStateSource).toContain('export interface FilesErrorState')
    expect(errorStateSource).toContain('export function getFilesListErrorState')
    expect(errorStateSource).toContain('export function getFilesDetailErrorState')
    expect(errorStateSource).toContain("from './resource-model'")
    expect(errorStateSource).not.toContain("from '../../browser'")
    expect(errorStateSource).not.toContain("from './browser'")
    expect(rootShimSource).toMatch(/^export \* from '.\/domain\/resource\/files-error-state'\n?$/)
    expect(listPaneControllerSource).toContain("from '../../domain/resource/files-error-state'")
    expect(detailPaneControllerSource).toContain("from './file-detail-pane-model'")
    expect(detailPaneControllerSource).not.toContain("from '../../domain/resource/files-error-state'")
    expect(detailPaneModelSource).toContain("from '../../domain/resource/files-error-state'")
  })

  it('keeps structured subject URI resolution in domain/resource instead of the Pod adapter', () => {
    expect(existsSync(structuredSubjectUriModelPath)).toBe(true)
    if (!existsSync(structuredSubjectUriModelPath)) return

    const modelSource = readFileSync(structuredSubjectUriModelPath, 'utf8')
    const podAdapterSource = readFileSync(podAdapterPath, 'utf8')

    expect(modelSource).toContain('export function resolveStructuredSubjectResourceUri')
    expect(modelSource).toContain('export function resolveStructuredSubjectContainingResourceUri')
    expect(modelSource).toContain('export function resolveStructuredSubjectExternalUri')
    expect(modelSource).not.toContain('SolidDatabase')
    expect(modelSource).not.toContain('fetch(')
    expect(podAdapterSource).toContain("from '../../domain/resource/structured-subject-uri'")
    expect(podAdapterSource).not.toMatch(/\nexport function resolveStructuredSubjectResourceUri\b/)
    expect(podAdapterSource).not.toMatch(/\nexport function resolveStructuredSubjectContainingResourceUri\b/)
    expect(podAdapterSource).not.toMatch(/\nexport function resolveStructuredSubjectExternalUri\b/)
  })

  it('keeps access policy parsing rules in the domain/resource layer instead of the Pod adapter', () => {
    expect(existsSync(accessPolicyModelPath)).toBe(true)
    if (!existsSync(accessPolicyModelPath)) return

    const accessPolicyModelSource = readFileSync(accessPolicyModelPath, 'utf8')
    const podAdapterSource = readFileSync(podAdapterPath, 'utf8')

    expect(accessPolicyModelSource).toContain('export function summarizeWacAclPolicy')
    expect(podAdapterSource).toContain("from '../../domain/resource/access-policy-model'")
    expect(podAdapterSource).not.toMatch(/\nfunction applyAccessMode\(/)
    expect(podAdapterSource).not.toMatch(/\nexport function summarizeWacAclPolicy\(/)
  })

  it('keeps Files tree node id rules in the domain/resource layer instead of the Pod adapter', () => {
    expect(existsSync(treeModelPath)).toBe(true)
    if (!existsSync(treeModelPath)) return

    const treeModelSource = readFileSync(treeModelPath, 'utf8')
    const podAdapterSource = readFileSync(podAdapterPath, 'utf8')

    expect(treeModelSource).toContain('export function createContainerNodeId')
    expect(treeModelSource).toContain('export function parseTreeNodeId')
    expect(podAdapterSource).toContain("from '../../domain/resource/tree-model'")
    expect(podAdapterSource).not.toMatch(/\nexport function createContainerNodeId\(/)
    expect(podAdapterSource).not.toMatch(/\nexport function parseTreeNodeId\(/)
  })

  it('keeps folder child open and transfer decisions in domain/folder with a root compatibility shim', () => {
    expect(existsSync(folderChildOpenModelPath)).toBe(true)
    expect(existsSync(rootFolderChildOpenShimPath)).toBe(true)
    if (!existsSync(folderChildOpenModelPath) || !existsSync(rootFolderChildOpenShimPath)) return

    const folderChildOpenSource = readFileSync(folderChildOpenModelPath, 'utf8')
    const rootShimSource = readFileSync(rootFolderChildOpenShimPath, 'utf8')
    const filesListOperationControllerSource = readFileSync(filesListOperationControllerFeaturePath, 'utf8')
    const filesListOperationModelSource = readFileSync(filesListOperationModelPath, 'utf8')
    const folderNavigationControllerSource = readFileSync(folderDetailNavigationControllerFeaturePath, 'utf8')
    const folderNavigationWorkflowModelSource = readFileSync(folderNavigationWorkflowModelFeaturePath, 'utf8')

    expect(folderChildOpenSource).toContain('export function resolveFolderChildOpenDecision')
    expect(folderChildOpenSource).toContain('export function resolveFolderChildRenameDestination')
    expect(folderChildOpenSource).toContain('export function resolveFolderChildTransferDestination')
    expect(folderChildOpenSource).not.toContain("from './browser'")
    expect(folderChildOpenSource).not.toContain("from '../../browser'")
    expect(rootShimSource).toMatch(/^export \* from '.\/domain\/folder\/folder-child-open'\n?$/)

    expect(folderNavigationControllerSource).toContain("from './folder-navigation-workflow-model'")
    expect(folderNavigationControllerSource).not.toContain("from '../../domain/folder/folder-child-open'")
    expect(folderNavigationWorkflowModelSource).toContain("from '../../domain/folder/folder-child-open'")
    for (const [filePath, expectedImport] of [
      [folderDetailChildViewsFeaturePath, "from '../../domain/folder/folder-child-open'"],
      [folderDetailColumnViewFeaturePath, "from '../../domain/folder/folder-child-open'"],
    ] as const) {
      expect(readFileSync(filePath, 'utf8')).toContain(expectedImport)
    }
    expect(filesListOperationControllerSource).toContain("from '../../domain/list/files-list-operation-model'")
    expect(filesListOperationControllerSource).not.toContain("from '../../domain/folder/folder-child-open'")
    expect(filesListOperationModelSource).toContain("from '../folder/folder-child-open'")
  })

  it('keeps list filtering and option projection in domain/list with a root compatibility shim', () => {
    expect(existsSync(listProjectionModelPath)).toBe(true)
    expect(existsSync(rootListProjectionShimPath)).toBe(true)
    if (!existsSync(listProjectionModelPath) || !existsSync(rootListProjectionShimPath)) return

    const listProjectionSource = readFileSync(listProjectionModelPath, 'utf8')
    const rootShimSource = readFileSync(rootListProjectionShimPath, 'utf8')
    const listPaneControllerSource = readFileSync(filesListPaneControllerFeaturePath, 'utf8')

    expect(listProjectionSource).toContain('export function projectVisibleFiles')
    expect(listProjectionSource).toContain('export function getRecentFiles')
    expect(listProjectionSource).toContain('export function getVisibleMimeTypeOptions')
    expect(listProjectionSource).toContain('export function getVisibleTagOptions')
    expect(listProjectionSource).not.toContain("from './browser'")
    expect(listProjectionSource).not.toContain("from '../../browser'")
    expect(rootShimSource).toMatch(/^export \* from '.\/domain\/list\/list-projection'\n?$/)
    expect(listPaneControllerSource).toContain("from '../../domain/list/list-projection'")
  })

  it('keeps chat file entry projection in domain/list with a root compatibility shim', () => {
    expect(existsSync(chatFilesProjectionModelPath)).toBe(true)
    expect(existsSync(rootChatFilesProjectionShimPath)).toBe(true)
    if (!existsSync(chatFilesProjectionModelPath) || !existsSync(rootChatFilesProjectionShimPath)) return

    const chatProjectionSource = readFileSync(chatFilesProjectionModelPath, 'utf8')
    const rootShimSource = readFileSync(rootChatFilesProjectionShimPath, 'utf8')
    const collectionsSource = readFileSync(filesCollectionsPath, 'utf8')
    const resourceCollectionSource = readFileSync(resourceCollectionPath, 'utf8')

    expect(chatProjectionSource).toContain('export function projectChatFileEntries')
    expect(chatProjectionSource).toContain('export function mergeChatFileEntries')
    expect(chatProjectionSource).toContain("from '../resource/resource-model'")
    expect(chatProjectionSource).toContain("from '../resource/resource-semantics'")
    expect(chatProjectionSource).not.toContain("from '../../browser'")
    expect(chatProjectionSource).not.toContain("from './browser'")
    expect(rootShimSource).toMatch(/^export \* from '.\/domain\/list\/chat-files-projection'\n?$/)
    expect(resourceCollectionSource).toContain("from '../../domain/list/chat-files-projection'")
    expect(collectionsSource).not.toContain("from '../../domain/list/chat-files-projection'")
    expect(collectionsSource).not.toContain("from '../../chat-files-projection'")
  })

  it('keeps structured view metadata serialization in the domain layer with a root compatibility shim', () => {
    expect(existsSync(structuredViewMetadataPath)).toBe(true)
    expect(existsSync(rootStructuredViewMetadataShimPath)).toBe(true)
    if (!existsSync(structuredViewMetadataPath) || !existsSync(rootStructuredViewMetadataShimPath)) return

    const metadataSource = readFileSync(structuredViewMetadataPath, 'utf8')
    const rootShimSource = readFileSync(rootStructuredViewMetadataShimPath, 'utf8')

    expect(metadataSource).toContain('export interface StructuredViewConfig')
    expect(metadataSource).toContain('export function renderStructuredViewMetadataTurtle')
    expect(metadataSource).toContain('export function parseStructuredViewMetadataTurtle')
    expect(metadataSource).not.toMatch(/from\s+['"][^'"]*(?:\.\.\/)+store(?:['"]|\/)/)
    expect(rootShimSource).toMatch(/^export \* from '.\/domain\/structured\/structured-view-metadata'\n?$/)
  })

  it('keeps Source Ingest manifest RDF serialization in domain/source with a root compatibility shim', () => {
    expect(existsSync(sourceIngestManifestPath)).toBe(true)
    expect(existsSync(rootSourceIngestManifestShimPath)).toBe(true)
    if (!existsSync(sourceIngestManifestPath) || !existsSync(rootSourceIngestManifestShimPath)) return

    const manifestSource = readFileSync(sourceIngestManifestPath, 'utf8')
    const rootShimSource = readFileSync(rootSourceIngestManifestShimPath, 'utf8')

    expect(manifestSource).toContain('export interface SourceIngestManifest')
    expect(manifestSource).toContain('export function renderSourceIngestManifestTurtle')
    expect(manifestSource).toContain('export function parseSourceIngestManifestTurtle')
    expect(manifestSource).toContain("from '../resource/files-rdf-contract'")
    expect(rootShimSource).toMatch(/^export \* from '.\/domain\/source\/source-ingest-manifest'\n?$/)
  })

  it('keeps Source Ingest plan and linked-card projection in domain/source with a root compatibility shim', () => {
    expect(existsSync(sourceIngestModelPath)).toBe(true)
    expect(existsSync(rootSourceIngestShimPath)).toBe(true)
    if (!existsSync(sourceIngestModelPath) || !existsSync(rootSourceIngestShimPath)) return

    const ingestSource = readFileSync(sourceIngestModelPath, 'utf8')
    const rootShimSource = readFileSync(rootSourceIngestShimPath, 'utf8')

    expect(ingestSource).toContain('export interface SourceIngestPlan')
    expect(ingestSource).toContain('export function createSourceIngestPlan')
    expect(ingestSource).toContain('export function renderSourceLinkedCardTurtle')
    expect(ingestSource).toContain('export function parseSourceLinkedCardTurtle')
    expect(ingestSource).not.toContain('fetch(')
    expect(ingestSource).not.toContain('SolidDatabase')
    expect(rootShimSource).toMatch(/^export \* from '.\/domain\/source\/source-ingest'\n?$/)
  })

  it('keeps proposal RDF readers in domain/proposal with a root compatibility shim', () => {
    expect(existsSync(proposalRdfPath)).toBe(true)
    expect(existsSync(rootProposalRdfShimPath)).toBe(true)
    if (!existsSync(proposalRdfPath) || !existsSync(rootProposalRdfShimPath)) return

    const proposalRdfSource = readFileSync(proposalRdfPath, 'utf8')
    const rootShimSource = readFileSync(rootProposalRdfShimPath, 'utf8')

    expect(proposalRdfSource).toContain('export function readProposalIri')
    expect(proposalRdfSource).toContain('export function readProposalLiteral')
    expect(rootShimSource).toMatch(/^export \* from '.\/domain\/proposal\/proposal-rdf'\n?$/)
  })

  it('keeps proposal status RDF parsing in domain/proposal with a root compatibility shim', () => {
    expect(existsSync(proposalStatusModelPath)).toBe(true)
    expect(existsSync(rootProposalStatusPath)).toBe(true)
    if (!existsSync(proposalStatusModelPath) || !existsSync(rootProposalStatusPath)) return

    const modelSource = readFileSync(proposalStatusModelPath, 'utf8')
    const rootSource = readFileSync(rootProposalStatusPath, 'utf8')

    expect(modelSource).toContain('export type FilesProposalStatus')
    expect(modelSource).toContain('export function updateProposalStatusInTurtle')
    expect(modelSource).toContain('export function readFilesProposalStatus')
    expect(modelSource).not.toContain('SolidDatabase')
    expect(modelSource).not.toContain('readRawTextResource')
    expect(modelSource).not.toContain('saveRawTextResource')

    expect(rootSource).toContain("from './domain/proposal/proposal-status'")
    expect(rootSource).toContain("from './data/proposal/proposal-status-resource'")
    expect(rootSource).not.toContain('export async function markFilesProposalResourceResolved')
    expect(rootSource).not.toContain('readRawTextResource')
    expect(rootSource).not.toContain('saveRawTextResource')
    expect(rootSource).not.toMatch(/\nexport function updateProposalStatusInTurtle\b/)
    expect(rootSource).not.toMatch(/\nexport function readFilesProposalStatus\b/)
  })

  it('keeps access proposal models in domain/proposal with a root compatibility shim', () => {
    expect(existsSync(accessApprovalModelPath)).toBe(true)
    expect(existsSync(rootAccessApprovalPath)).toBe(true)
    if (!existsSync(accessApprovalModelPath) || !existsSync(rootAccessApprovalPath)) return

    const modelSource = readFileSync(accessApprovalModelPath, 'utf8')
    const rootSource = readFileSync(rootAccessApprovalPath, 'utf8')

    expect(modelSource).toContain('export interface AccessPolicyProposal')
    expect(modelSource).toContain('export function createAccessPolicyProposal')
    expect(modelSource).toContain('export function renderAccessPolicyProposalTurtle')
    expect(modelSource).toContain('export function parseAccessPolicyProposalTurtle')
    expect(modelSource).toContain('export function applyAccessPolicyProposalToAclTurtle')
    expect(modelSource).not.toContain('SolidDatabase')
    expect(modelSource).not.toContain('readRawTextResource')
    expect(modelSource).not.toContain('saveRawTextResource')

    expect(rootSource).toContain("from './domain/proposal/access-approval-model'")
    expect(rootSource).toContain("from './data/proposal/access-approval-commands'")
    expect(rootSource).not.toContain('export async function approveAccessPolicyProposalFromInbox')
    expect(rootSource).not.toContain('export async function createAccessPolicyProposalInboxApproval')
    expect(rootSource).not.toContain('readRawTextResource')
    expect(rootSource).not.toContain('saveRawTextResource')
    expect(rootSource).not.toMatch(/\nexport interface AccessPolicyProposal\b/)
    expect(rootSource).not.toMatch(/\nexport function createAccessPolicyProposal\b/)
    expect(rootSource).not.toMatch(/\nexport function renderAccessPolicyProposalTurtle\b/)
    expect(rootSource).not.toMatch(/\nexport function parseAccessPolicyProposalTurtle\b/)
  })

  it('keeps access proposal pure model consumers pointed at domain/proposal instead of the root IO facade', () => {
    const useCasesSource = readFileSync(accessPolicyProposalUseCasesPath, 'utf8')
    const useCaseRootImport = readImportBlock(useCasesSource, './access-approval')

    expect(useCaseRootImport).toBe('')
    expect(useCaseRootImport).not.toContain('renderAccessPolicyProposalTurtle')
    expect(useCaseRootImport).not.toContain('type AccessPolicyProposal')
    expect(useCasesSource).toContain("from './access-approval-commands'")
    expect(useCasesSource).toContain("from '../../domain/proposal/access-approval-model'")

    for (const [filePath, requiredImport] of [
      [proposalCollectionsPath, 'domain/proposal/access-approval-model'],
      [proposalQueriesPath, 'domain/proposal/access-approval-model'],
      [accessPolicyDialogModelPath, "from '../proposal/access-approval-model'"],
    ] as const) {
      const source = readFileSync(filePath, 'utf8')
      expect(source, `${filePath} must not import pure access proposal models through the root IO facade`).not.toContain("from '../../access-approval'")
      expect(source, `${filePath} must not import pure access proposal models through the root IO facade`).not.toContain("from './access-approval'")
      expect(source, `${filePath} must import pure access proposal models from domain/proposal`).toContain(requiredImport)
    }
  })

  it('keeps access dialog policy targeting in domain/resource with a root compatibility shim', () => {
    expect(existsSync(accessPolicyDialogModelPath)).toBe(true)
    expect(existsSync(rootAccessPolicyDialogModelShimPath)).toBe(true)
    if (!existsSync(accessPolicyDialogModelPath) || !existsSync(rootAccessPolicyDialogModelShimPath)) return

    const modelSource = readFileSync(accessPolicyDialogModelPath, 'utf8')
    const rootShimSource = readFileSync(rootAccessPolicyDialogModelShimPath, 'utf8')

    expect(modelSource).toContain('export function resolveAccessProposalPolicyTarget')
    expect(modelSource).toContain('export function createAccessPolicyDialogProposal')
    expect(modelSource).toContain("from '../proposal/access-approval-model'")
    expect(modelSource).toContain("from './resource-model'")
    expect(modelSource).toContain("from './resource-semantics'")
    expect(modelSource).not.toContain("from './browser'")
    expect(modelSource).not.toContain("from '../browser'")
    expect(rootShimSource).toMatch(/^export \* from '.\/domain\/resource\/access-policy-dialog-model'\n?$/)
  })

  it('keeps AI change proposal models in domain/proposal with a root compatibility shim', () => {
    expect(existsSync(aiChangeApprovalModelPath)).toBe(true)
    expect(existsSync(rootAiChangeApprovalPath)).toBe(true)
    if (!existsSync(aiChangeApprovalModelPath) || !existsSync(rootAiChangeApprovalPath)) return

    const modelSource = readFileSync(aiChangeApprovalModelPath, 'utf8')
    const rootSource = readFileSync(rootAiChangeApprovalPath, 'utf8')

    expect(modelSource).toContain('export interface AiChangeProposal')
    expect(modelSource).toContain('export function createAiChangeProposal')
    expect(modelSource).toContain('export function renderAiChangeProposalTurtle')
    expect(modelSource).toContain('export function parseAiChangeProposalTurtle')
    expect(modelSource).toContain('export function applyAiChangeProposalToContent')
    expect(modelSource).not.toContain('SolidDatabase')
    expect(modelSource).not.toContain('readRawTextResource')
    expect(modelSource).not.toContain('saveRawTextResource')

    expect(rootSource).toContain("from './domain/proposal/ai-change-approval-model'")
    expect(rootSource).toContain("from './data/proposal/ai-change-approval-commands'")
    expect(rootSource).not.toContain('export async function approveAiChangeProposalFromInbox')
    expect(rootSource).not.toContain('export async function createAiChangeProposalInboxApproval')
    expect(rootSource).not.toContain('readRawTextResource')
    expect(rootSource).not.toContain('saveRawTextResource')
    expect(rootSource).not.toMatch(/\nexport interface AiChangeProposal\b/)
  })

  it('keeps AI proposal pure model consumers pointed at domain/proposal instead of the root IO facade', () => {
    const useCasesSource = readFileSync(aiChangeProposalUseCasesPath, 'utf8')
    const useCaseRootImport = readImportBlock(useCasesSource, './ai-change-approval')

    expect(useCaseRootImport).toBe('')
    expect(useCaseRootImport).not.toContain('renderAiChangeProposalTurtle')
    expect(useCaseRootImport).not.toContain('type AiChangeProposal')
    expect(useCasesSource).toContain("from './ai-change-approval-commands'")
    expect(useCasesSource).toContain("from '../../domain/proposal/ai-change-approval-model'")

    for (const filePath of [proposalCollectionsPath, proposalQueriesPath, fileEditorSheetControllerFeaturePath]) {
      const source = readFileSync(filePath, 'utf8')
      expect(source, `${filePath} must not import pure AI proposal models through the root IO facade`).not.toContain("from '../../ai-change-approval'")
      expect(source, `${filePath} must import pure AI proposal models from domain/proposal`).toContain("from '../../domain/proposal/ai-change-approval-model'")
    }
  })

  it('keeps structured cell proposal models in domain/proposal with a root compatibility shim', () => {
    expect(existsSync(structuredCellApprovalModelPath)).toBe(true)
    expect(existsSync(rootStructuredCellApprovalPath)).toBe(true)
    if (!existsSync(structuredCellApprovalModelPath) || !existsSync(rootStructuredCellApprovalPath)) return

    const modelSource = readFileSync(structuredCellApprovalModelPath, 'utf8')
    const rootSource = readFileSync(rootStructuredCellApprovalPath, 'utf8')

    expect(modelSource).toContain('export interface StructuredCellChangeProposal')
    expect(modelSource).toContain('export function createStructuredCellChangeProposal')
    expect(modelSource).toContain('export function renderStructuredCellChangeProposalTurtle')
    expect(modelSource).toContain('export function parseStructuredCellChangeProposalTurtle')
    expect(modelSource).toContain('export function applyStructuredCellChangeProposalToTurtle')
    expect(modelSource).not.toContain('SolidDatabase')
    expect(modelSource).not.toContain('readRawTextResource')
    expect(modelSource).not.toContain('createRawTextResource')

    expect(rootSource).toContain("from './domain/proposal/structured-cell-approval-model'")
    expect(rootSource).toContain("from './data/proposal/structured-cell-approval-commands'")
    expect(rootSource).not.toContain('export async function approveStructuredCellChangeProposalFromInbox')
    expect(rootSource).not.toContain('export async function createStructuredCellChangeProposalInboxApproval')
    expect(rootSource).not.toContain('readRawTextResource')
    expect(rootSource).not.toContain('createRawTextResource')
    expect(rootSource).not.toMatch(/\nexport interface StructuredCellChangeProposal\b/)
    expect(rootSource).not.toMatch(/\nexport function createStructuredCellChangeProposal\b/)
    expect(rootSource).not.toMatch(/\nexport function renderStructuredCellChangeProposalTurtle\b/)
    expect(rootSource).not.toMatch(/\nexport function parseStructuredCellChangeProposalTurtle\b/)
  })

  it('keeps structured cell pure model consumers pointed at domain/proposal instead of the root IO facade', () => {
    const useCasesSource = readFileSync(structuredCellProposalUseCasesPath, 'utf8')
    const useCaseRootImport = readImportBlock(useCasesSource, './structured-cell-approval')

    expect(useCaseRootImport).toBe('')
    expect(useCaseRootImport).not.toContain('renderStructuredCellChangeProposalTurtle')
    expect(useCaseRootImport).not.toContain('type StructuredCellChangeProposal')
    expect(useCasesSource).toContain("from './structured-cell-approval-commands'")
    expect(useCasesSource).toContain("from '../../domain/proposal/structured-cell-approval-model'")

    const rootFacadeImportChecks = [
      [proposalCollectionsPath, "from '../../structured-cell-approval'", 'domain/proposal/structured-cell-approval-model'],
      [proposalQueriesPath, "from '../../structured-cell-approval'", 'domain/proposal/structured-cell-approval-model'],
      [structuredCellProposalWorkflowControllerFeaturePath, "from '../../structured-cell-approval'", 'domain/proposal/structured-cell-approval-model'],
      [detailMetaPredicateControllerFeaturePath, "from '../../structured-cell-approval'", 'domain/proposal/structured-cell-approval-model'],
      [detailMetadataEditorModelPath, "from './structured-cell-approval'", "from '../proposal/structured-cell-approval-model'"],
      [structuredTableCellModelDomainPath, "from '../../structured-cell-approval'", "from '../proposal/structured-cell-approval-model'"],
    ] as const

    for (const [filePath, forbiddenImport, requiredImport] of rootFacadeImportChecks) {
      const source = readFileSync(filePath, 'utf8')
      expect(source, `${filePath} must not import pure structured cell proposal models through the root IO facade`).not.toContain(forbiddenImport)
      expect(source, `${filePath} must import pure structured cell proposal models from domain/proposal`).toContain(requiredImport)
    }
  })

  it('keeps detail metadata editor rules in domain/detail with a root compatibility shim', () => {
    expect(existsSync(detailMetadataEditorModelPath)).toBe(true)
    expect(existsSync(rootDetailMetadataEditorModelShimPath)).toBe(true)
    if (!existsSync(detailMetadataEditorModelPath) || !existsSync(rootDetailMetadataEditorModelShimPath)) return

    const modelSource = readFileSync(detailMetadataEditorModelPath, 'utf8')
    const rootShimSource = readFileSync(rootDetailMetadataEditorModelShimPath, 'utf8')

    expect(modelSource).toContain('export function sourceLinkedCardBodyUri')
    expect(modelSource).toContain('export function shouldCreateDetailMetaPredicateProposal')
    expect(modelSource).toContain("from '../proposal/structured-cell-approval-model'")
    expect(modelSource).not.toContain("from './browser'")
    expect(modelSource).not.toContain("from '../browser'")
    expect(modelSource).not.toContain('useState')
    expect(rootShimSource).toMatch(/^export \* from '.\/domain\/detail\/detail-metadata-editor-model'\n?$/)
  })

  it('keeps vocab proposal parsing and approval constants with the structured domain model while root only re-exports commands', () => {
    expect(existsSync(structuredTableDomainPath)).toBe(true)
    expect(existsSync(rootVocabApprovalPath)).toBe(true)
    if (!existsSync(structuredTableDomainPath) || !existsSync(rootVocabApprovalPath)) return

    const modelSource = readFileSync(structuredTableDomainPath, 'utf8')
    const rootSource = readFileSync(rootVocabApprovalPath, 'utf8')

    expect(modelSource).toContain('export interface VocabTermProposal')
    expect(modelSource).toContain('export const FILES_VOCAB_APPROVAL_ACTION')
    expect(modelSource).toContain('export function createVocabTermProposal')
    expect(modelSource).toContain('export function renderVocabTermProposalTurtle')
    expect(modelSource).toContain('export function parseVocabTermProposalTurtle')
    expect(modelSource).not.toContain('SolidDatabase')
    expect(modelSource).not.toContain('readRawTextResource')
    expect(modelSource).not.toContain('createRawTextResource')

    expect(rootSource).toContain("from './domain/structured/structured-table'")
    expect(rootSource).toContain("from './data/proposal/vocab-approval-commands'")
    expect(rootSource).not.toContain('SolidDatabase')
    expect(rootSource).not.toContain('readRawTextResource')
    expect(rootSource).not.toContain('createRawTextResource')
    expect(rootSource).not.toMatch(/\nfunction /)
    expect(rootSource).not.toMatch(/\nexport async function /)
    expect(rootSource).not.toMatch(/\nexport const FILES_VOCAB_APPROVAL_ACTION\b/)
    expect(rootSource).not.toMatch(/\nexport function parseVocabTermProposalTurtle\b/)
  })

  it('keeps Source approval proposal models in domain/source with a root compatibility shim', () => {
    expect(existsSync(sourceApprovalModelPath)).toBe(true)
    expect(existsSync(rootSourceApprovalPath)).toBe(true)
    if (!existsSync(sourceApprovalModelPath) || !existsSync(rootSourceApprovalPath)) return

    const modelSource = readFileSync(sourceApprovalModelPath, 'utf8')
    const rootSource = readFileSync(rootSourceApprovalPath, 'utf8')

    expect(modelSource).toContain('export interface SourceUpdateProposal')
    expect(modelSource).toContain('export function createSourceUpdateProposal')
    expect(modelSource).toContain('export function renderSourceUpdateProposalTurtle')
    expect(modelSource).toContain('export function parseSourceUpdateProposalTurtle')
    expect(modelSource).toContain('export function applySourceUpdateProposalToContent')
    expect(modelSource).not.toContain('SolidDatabase')
    expect(modelSource).not.toContain('readRawTextResource')
    expect(modelSource).not.toContain('saveRawTextResource')

    expect(rootSource).toContain("from './domain/source/source-approval-model'")
    expect(rootSource).toContain("from './data/proposal/source-approval-commands'")
    expect(rootSource).not.toContain('export async function approveSourceUpdateProposalFromInbox')
    expect(rootSource).not.toContain('export async function createSourceUpdateProposalInboxApproval')
    expect(rootSource).not.toContain('readRawTextResource')
    expect(rootSource).not.toContain('saveRawTextResource')
    expect(rootSource).not.toMatch(/\nexport interface SourceUpdateProposal\b/)
  })

  it('keeps domain modules free of React, store, query, collection, and Pod adapter dependencies', () => {
    const domainFiles = listSourceFiles(domainRootPath)

    expect(domainFiles).toContain('src/modules/files/domain/list/list-view-model.ts')

    for (const filePath of domainFiles) {
      const source = readFileSync(filePath, 'utf8')

      for (const pattern of forbiddenDomainDependencyPatterns) {
        expect(source, `${filePath} must not match ${pattern}`).not.toMatch(pattern)
      }
    }
  })
})
