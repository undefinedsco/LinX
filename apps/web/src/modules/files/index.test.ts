import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import * as filesModule from './index'
import * as queriesModule from './queries'

const queryFacadePath = 'src/modules/files/data/queries/index.ts'
const proposalQueriesPath = 'src/modules/files/data/queries/proposal-queries.ts'
const resourceQueriesPath = 'src/modules/files/data/queries/resource-queries.ts'
const vocabQueriesPath = 'src/modules/files/data/queries/vocab-queries.ts'
const collectionFacadePath = 'src/modules/files/data/collections/index.ts'
const resourceCollectionPath = 'src/modules/files/data/collections/resource-collection.ts'

describe('files public module exports', () => {
  it('keeps the module root export surface to applet entrypoints only', () => {
    expect(Object.keys(filesModule).sort()).toEqual([
      'FileDetailPane',
      'FilesListPane',
      'FilesTreePane',
      'useFilesStore',
    ])
    expect(Object.keys(filesModule).filter((key) => /^use[A-Z]/.test(key))).toEqual(['useFilesStore'])
    expect(filesModule).not.toHaveProperty('getFilesEntryOpenMode')
    expect(filesModule).not.toHaveProperty('FilesSaveConflictError')
    expect(filesModule).not.toHaveProperty('useRequestSourceIngestRange')
    expect(filesModule).not.toHaveProperty('useMarkSourceIngestRangeIngested')
  })

  it('keeps Files query hooks Ingest-named instead of exporting SourceIndex aliases', () => {
    expect(queriesModule).toHaveProperty('useRequestSourceIngestRange')
    expect(queriesModule).toHaveProperty('useMarkSourceIngestRangeIngested')
    expect(queriesModule).not.toHaveProperty('useMarkSourceIngestRangeIndexed')
    expect(queriesModule).not.toHaveProperty('useRequestSourceIndexRange')
    expect(queriesModule).not.toHaveProperty('useMarkSourceIndexRangeIndexed')
  })

  it('keeps public Ingest hook inputs free of legacy extractor wording', () => {
    const querySource = readFileSync(queryFacadePath, 'utf8')
    const createSourceIngestHook = querySource.match(/export function useCreateSourceIngest\(\)[\s\S]*?export function useRefreshSourceLinkedCard\(\)/)?.[0] ?? ''
    const refreshSourceHook = querySource.match(/export function useRefreshSourceLinkedCard\(\)[\s\S]*?export function useRequestSourceIngestRange\(\)/)?.[0] ?? ''

    const legacyPublicInputWords = /\bextractDocument\b|\bextractorVersion\b|\bparserVersion\b|\bparserManifestUri\b|\bsourceIndexManifestUri\b/

    expect(createSourceIngestHook).not.toMatch(legacyPublicInputWords)
    expect(refreshSourceHook).not.toMatch(legacyPublicInputWords)
  })

  it('keeps new Ingest query wiring off deprecated indexed range services', () => {
    const querySource = readFileSync(queryFacadePath, 'utf8')

    expect(querySource).not.toMatch(/\bmarkSourceIngestRangeIndexedResource\b/)
  })

  it('keeps Files query hooks from owning raw cache invalidation details', () => {
    const querySource = readFileSync(queryFacadePath, 'utf8')

    expect(querySource).not.toContain('queryClient.invalidateQueries')
  })

  it('keeps Files query hooks from owning mutation cache lifecycle callbacks', () => {
    const querySource = readFileSync(queryFacadePath, 'utf8')

    expect(querySource).not.toMatch(/\bonSuccess\s*:/)
  })

  it('keeps Files query hooks from owning optimistic cache transaction details', () => {
    const querySource = readFileSync(queryFacadePath, 'utf8')

    expect(querySource).not.toContain('filesEntryCacheCollection')
    expect(querySource).not.toContain('filesStructuredViewMetadataCacheCollection')
    expect(querySource).not.toContain('structuredCellProposalCacheCollection')
    expect(querySource).not.toMatch(/\bstage(?:RawTextSave|ResourceCreate|Transfer|Delete|FolderCreate|Save|Create)?\b/)
    expect(querySource).not.toMatch(/\bcommit(?:RawTextSave|ResourceCreate|Transfer|FolderCreate|Save)?\b/)
    expect(querySource).not.toMatch(/\brestore\(/)
  })

  it('keeps Files query hooks from defining a shadow collection query-key registry', () => {
    const querySource = readFileSync(queryFacadePath, 'utf8')

    expect(querySource).not.toContain('const FILES_QUERY_KEYS')
    expect(querySource).not.toContain('...FILES_QUERY_KEYS')
  })

  it('keeps Files read query hooks behind the query collection wrapper', () => {
    const querySource = readFileSync(queryFacadePath, 'utf8')
    const resourceQueriesSource = readFileSync(resourceQueriesPath, 'utf8')
    const collectionSource = readFileSync(collectionFacadePath, 'utf8')

    expect(collectionSource).toContain('filesResourceQueryCollection')
    expect(querySource).toContain("export * from './resource-queries'")
    expect(querySource).not.toContain('filesResourceQueryCollection')
    expect(resourceQueriesSource).toContain('filesResourceQueryCollection')
    expect(resourceQueriesSource).not.toContain('filesResourceQueryKeys')
    expect(resourceQueriesSource).not.toMatch(/filesResourceCollection\.(?:buildRoots|listChildTreeNodes|listEntries|readDetail|readRawText|readBlob|readAccessBasics|readMetaSidecar|readStructuredViewMetadata)\b/)
    expect(querySource).not.toContain('filesVocabDiscoveryCollection.queryKey')
  })

  it('keeps Files entry listing strategy behind the resource collection', () => {
    const querySource = readFileSync(queryFacadePath, 'utf8')
    const resourceQueriesSource = readFileSync(resourceQueriesPath, 'utf8')

    for (const source of [querySource, resourceQueriesSource]) {
      expect(source).not.toContain("from '../../chat-files-projection'")
      expect(source).not.toContain('filesResourceCollection.listAllEntries')
      expect(source).not.toContain('filesResourceCollection.listContainerEntries')
    }
  })

  it('keeps current Pod root resolution behind the Files collection boundary', () => {
    const collectionSource = readFileSync(collectionFacadePath, 'utf8')
    const querySource = readFileSync(queryFacadePath, 'utf8')
    const resourceQueriesSource = readFileSync(resourceQueriesPath, 'utf8')
    const detailPaneSource = readFileSync('src/modules/files/components/FileDetailPane.tsx', 'utf8')
    const detailMetadataPanelsSource = readFileSync('src/modules/files/features/detail/FileDetailMetadataPanels.tsx', 'utf8')
    const detailMetadataPredicateControllerSource = readFileSync('src/modules/files/features/detail/useDetailMetaPredicateController.ts', 'utf8')
    const structuredPreviewSource = readFileSync('src/modules/files/features/structured/StructuredTablePreview.tsx', 'utf8')
    const structuredPreviewControllerSource = readFileSync('src/modules/files/features/structured/useStructuredResourcePreviewController.ts', 'utf8')

    expect(collectionSource).toContain('resolveCurrentPodRootUri')
    expect(querySource).toContain("export * from './resource-queries'")
    expect(resourceQueriesSource).toContain('useFilesCurrentPodRootUri')
    expect(resourceQueriesSource).toContain('filesResourceQueryCollection.resolveCurrentPodRootUri')
    expect(resourceQueriesSource).not.toContain('filesResourceCollection.resolveCurrentPodRootUri')

    for (const componentSource of [detailPaneSource, detailMetadataPanelsSource, structuredPreviewSource]) {
      expect(componentSource).not.toContain('@/providers/solid-database-provider')
      expect(componentSource).not.toContain('@/lib/data/current-pod-base')
    }
    expect(detailPaneSource).not.toContain('useFilesCurrentPodRootUri')
    expect(detailMetadataPanelsSource).not.toContain('useFilesCurrentPodRootUri')
    expect(structuredPreviewSource).not.toContain('useFilesCurrentPodRootUri')
    for (const componentSource of [detailMetadataPredicateControllerSource, structuredPreviewControllerSource]) {
      expect(componentSource).toContain('useFilesCurrentPodRootUri')
    }
  })

  it('keeps collection internals using the resource collection as the Pod root resolver', () => {
    const collectionSource = readFileSync(collectionFacadePath, 'utf8')
    const resourceCollectionSource = readFileSync(resourceCollectionPath, 'utf8')
    const sourceIngestUseCaseSource = readFileSync('src/modules/files/data/ingest/source-ingest-use-cases.ts', 'utf8')

    expect(resourceCollectionSource.match(/resolveCurrentPodBaseUrl\(db\)/g) ?? []).toHaveLength(1)
    expect(collectionSource).not.toContain('resolveCurrentPodBaseUrl')
    expect(collectionSource).toContain('resolveCurrentPodRootUri: filesResourceCollection.resolveCurrentPodRootUri')
    expect(sourceIngestUseCaseSource).toContain('input.podRootUri ?? input.resolveCurrentPodRootUri?.(db) ?? undefined')
  })

  it('keeps vocab Type Index discovery behind the Files collection boundary', () => {
    const collectionSource = readFileSync(collectionFacadePath, 'utf8')
    const vocabDiscoveryCollectionSource = readFileSync(
      'src/modules/files/data/collections/vocab-discovery-collection.ts',
      'utf8',
    )
    const querySource = readFileSync(queryFacadePath, 'utf8')
    const vocabQueriesSource = readFileSync(vocabQueriesPath, 'utf8')

    expect(collectionSource).toContain('filesVocabDiscoveryCollection')
    expect(collectionSource).toContain('createVocabDiscoveryCollections({')
    expect(collectionSource).not.toContain('discoverSolidTypeIndexRegistrationsFromWebId')
    expect(collectionSource).not.toContain('createSolidTypeIndexResourceTextReader')
    expect(vocabDiscoveryCollectionSource).toContain('discoverSolidTypeIndexRegistrationsFromWebId')
    expect(vocabDiscoveryCollectionSource).toContain('createSolidTypeIndexResourceTextReader')
    expect(querySource).toContain("export * from './vocab-queries'")
    expect(querySource).not.toContain('filesVocabDiscoveryQueryCollection')
    expect(vocabQueriesSource).toContain('filesVocabDiscoveryQueryCollection')
    expect(querySource).not.toContain('filesVocabDiscoveryCollection')
    expect(querySource).not.toContain("from '../../vocab-discovery'")
    expect(querySource).not.toContain('discoverSolidTypeIndexRegistrationsFromWebId')
    expect(querySource).not.toContain('createSolidTypeIndexResourceTextReader')
  })

  it('keeps pending proposal read query hooks behind the proposal query collection wrapper', () => {
    const collectionSource = readFileSync(collectionFacadePath, 'utf8')
    const querySource = readFileSync(queryFacadePath, 'utf8')
    const proposalQueriesSource = readFileSync(proposalQueriesPath, 'utf8')

    expect(collectionSource).toContain('filesProposalQueryCollection')
    expect(querySource).toContain("export * from './proposal-queries'")
    expect(querySource).not.toContain('filesProposalQueryCollection')
    expect(proposalQueriesSource).toContain('filesProposalQueryCollection')
    expect(querySource).not.toMatch(/\b(?:structuredCellProposalCollection|vocabTermProposalCollection|sourceUpdateProposalCollection)\.fetchByDocument\b/)
    expect(querySource).not.toMatch(/\baccessPolicyProposalCollection\.fetchByOwner\b/)
    expect(querySource).not.toMatch(/\b(?:structuredCellProposalCollection|vocabTermProposalCollection|sourceUpdateProposalCollection|accessPolicyProposalCollection)\.queryKey\b/)
    expect(proposalQueriesSource).not.toMatch(/\b(?:structuredCellProposalCollection|vocabTermProposalCollection|sourceUpdateProposalCollection)\.fetchByDocument\b/)
    expect(proposalQueriesSource).not.toMatch(/\baccessPolicyProposalCollection\.fetchByOwner\b/)
    expect(proposalQueriesSource).not.toMatch(/\b(?:structuredCellProposalCollection|vocabTermProposalCollection|sourceUpdateProposalCollection|accessPolicyProposalCollection)\.queryKey\b/)
  })

  it('advertises clean Ingest input contracts for source plan and proposal creation', () => {
    const ingestSource = readFileSync('src/modules/files/domain/source/source-ingest.ts', 'utf8')
    const approvalModelSource = readFileSync('src/modules/files/domain/source/source-approval-model.ts', 'utf8')
    const legacyPublicInputWords =
      /\bextractDocument\b|\bextractorVersion\b|\bparserVersion\b|\bparserManifestUri\b|\bsourceIndexManifestUri\b|\bextractedSource\b/

    const ingestPlanInput = ingestSource.match(/export interface SourceIngestPlanInput \{[\s\S]*?\n\}/)?.[0] ?? ''
    const refreshPlanInput = ingestSource.match(/export interface SourceRefreshPlanInput \{[\s\S]*?\n\}/)?.[0] ?? ''
    const proposalInput = approvalModelSource.match(/export interface SourceUpdateProposalInput \{[\s\S]*?\n\}/)?.[0] ?? ''

    expect(ingestSource).toContain('export function createSourceIngestPlan<T extends SourceIngestPlanInput>(input: T)')
    expect(ingestSource).toContain('export function createSourceRefreshPlan<T extends SourceRefreshPlanInput>(input: T)')
    expect(approvalModelSource).toContain('export function createSourceUpdateProposal<T extends SourceUpdateProposalInput>(input: T)')
    expect(ingestPlanInput).not.toMatch(legacyPublicInputWords)
    expect(refreshPlanInput).not.toMatch(legacyPublicInputWords)
    expect(proposalInput).not.toMatch(legacyPublicInputWords)
  })

  it('advertises Ingest-first output contracts without SourceIndex compatibility fields', () => {
    const ingestSource = readFileSync('src/modules/files/domain/source/source-ingest.ts', 'utf8')
    const approvalModelSource = readFileSync('src/modules/files/domain/source/source-approval-model.ts', 'utf8')
    const legacyOutputWords = /\bsourceIndexManifest(?:Uri)?\b|\bSourceIndexManifest\b/

    const outputContracts = [
      ingestSource.match(/export interface SourceIngestPlan \{[\s\S]*?\n\}/)?.[0] ?? '',
      ingestSource.match(/export interface SourceRefreshPlan \{[\s\S]*?\n\}/)?.[0] ?? '',
      ingestSource.match(/export interface SourceLinkedCardDescriptor \{[\s\S]*?\n\}/)?.[0] ?? '',
      approvalModelSource.match(/export interface SourceUpdateProposal \{[\s\S]*?\n\}/)?.[0] ?? '',
    ]

    for (const contract of outputContracts) {
      expect(contract).not.toMatch(legacyOutputWords)
    }
  })

  it('keeps deprecated extractor aliases out of the public Files module', () => {
    expect(filesModule).not.toHaveProperty('createExtractedSourceSnapshot')
    expect(filesModule).not.toHaveProperty('createExtractedUrlSnapshot')
  })
})
