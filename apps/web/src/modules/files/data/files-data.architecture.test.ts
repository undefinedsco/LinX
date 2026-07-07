import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const filesRootPath = 'src/modules/files'
const queryFacadePath = 'src/modules/files/data/queries/index.ts'
const queryOwnersRootPath = 'src/modules/files/data/queries'
const proposalQueriesPath = 'src/modules/files/data/queries/proposal-queries.ts'
const resourceQueriesPath = 'src/modules/files/data/queries/resource-queries.ts'
const sidecarQueriesPath = 'src/modules/files/data/queries/sidecar-queries.ts'
const sourceIngestQueriesPath = 'src/modules/files/data/queries/source-ingest-queries.ts'
const vocabQueriesPath = 'src/modules/files/data/queries/vocab-queries.ts'
const inboxApprovalQueriesPath = 'src/modules/files/data/queries/inbox-approval-queries.ts'
const favoriteQueriesPath = 'src/modules/files/data/queries/favorite-queries.ts'
const chatSourceQueriesPath = 'src/modules/files/data/queries/chat-source-queries.ts'
const collectionFacadePath = 'src/modules/files/data/collections/index.ts'
const inboxApprovalSourcePath = 'src/modules/files/data/collections/inbox-approval-source.ts'
const proposalCollectionsPath = 'src/modules/files/data/collections/proposal-collections.ts'
const queryKeysCollectionPath = 'src/modules/files/data/collections/query-keys.ts'
const resourceCollectionPath = 'src/modules/files/data/collections/resource-collection.ts'
const resourceMutationCollectionPath = 'src/modules/files/data/collections/resource-mutation-collection.ts'
const resourceQueryCollectionPath = 'src/modules/files/data/collections/resource-query-collection.ts'
const runtimeCollectionPath = 'src/modules/files/data/collections/runtime.ts'
const sidecarMutationCollectionPath = 'src/modules/files/data/collections/sidecar-mutation-collection.ts'
const sidecarQueryCollectionPath = 'src/modules/files/data/collections/sidecar-query-collection.ts'
const sourceIngestCollectionPath = 'src/modules/files/data/collections/source-ingest-collection.ts'
const subscriptionCollectionPath = 'src/modules/files/data/collections/subscription-collection.ts'
const vocabDiscoveryCollectionPath = 'src/modules/files/data/collections/vocab-discovery-collection.ts'
const entryTransferOverlaysPath = 'src/modules/files/data/cache/entry-transfer-overlays.ts'
const filesEntryCachePath = 'src/modules/files/data/cache/files-entry-cache.ts'
const resourceQueryCachePath = 'src/modules/files/data/cache/resource-query-cache.ts'
const optimisticMutationCachePath = 'src/modules/files/data/cache/optimistic-mutation.ts'
const proposalQueryCachePath = 'src/modules/files/data/cache/proposal-query-cache.ts'
const filesQueryInvalidationPath = 'src/modules/files/data/cache/files-query-invalidation.ts'
const sourceIngestCachePath = 'src/modules/files/data/cache/source-ingest-cache.ts'
const structuredViewMetadataCachePath = 'src/modules/files/data/cache/structured-view-metadata-cache.ts'
const sourceIngestServicePath = 'src/modules/files/data/ingest/source-ingest-service.ts'
const sourceIngestSnapshotPath = 'src/modules/files/data/ingest/source-ingest-snapshot.ts'
const sourceExtractorCompatPath = 'src/modules/files/data/ingest/source-extractor-compat.ts'
const podAdapterPath = 'src/modules/files/data/pod-adapter/index.ts'
const podRuntimePath = 'src/modules/files/data/pod-adapter/pod-runtime.ts'
const vocabDiscoveryPath = 'src/modules/files/data/vocab/vocab-discovery.ts'
const accessApprovalCommandsPath = 'src/modules/files/data/proposal/access-approval-commands.ts'
const aiChangeApprovalCommandsPath = 'src/modules/files/data/proposal/ai-change-approval-commands.ts'
const proposalApplicationCollectionPath = 'src/modules/files/data/proposal/proposal-application-collection.ts'
const proposalStatusResourcePath = 'src/modules/files/data/proposal/proposal-status-resource.ts'
const sourceApprovalCommandsPath = 'src/modules/files/data/proposal/source-approval-commands.ts'
const structuredCellApprovalCommandsPath = 'src/modules/files/data/proposal/structured-cell-approval-commands.ts'
const vocabApprovalCommandsPath = 'src/modules/files/data/proposal/vocab-approval-commands.ts'
const rootQueryShimPath = 'src/modules/files/queries.ts'
const rootCollectionShimPath = 'src/modules/files/collections.ts'
const rootBrowserShimPath = 'src/modules/files/browser.ts'
const rootAccessApprovalShimPath = 'src/modules/files/access-approval.ts'
const rootAiChangeApprovalShimPath = 'src/modules/files/ai-change-approval.ts'
const rootProposalApplicationCollectionShimPath = 'src/modules/files/proposal-application-collection.ts'
const rootProposalStatusShimPath = 'src/modules/files/proposal-status.ts'
const rootSourceApprovalShimPath = 'src/modules/files/source-approval.ts'
const rootStructuredCellApprovalShimPath = 'src/modules/files/structured-cell-approval.ts'
const rootVocabApprovalShimPath = 'src/modules/files/vocab-approval.ts'
const rootEntryTransferOverlaysShimPath = 'src/modules/files/entry-transfer-overlays.ts'
const rootSourceIngestServiceShimPath = 'src/modules/files/source-ingest-service.ts'
const rootSourceIngestSnapshotShimPath = 'src/modules/files/source-ingest-snapshot.ts'
const rootSourceExtractorShimPath = 'src/modules/files/source-extractor.ts'
const rootVocabDiscoveryShimPath = 'src/modules/files/vocab-discovery.ts'
const entryScopeDomainPath = 'src/modules/files/domain/list/entry-scope.ts'
const uiFacingProductionRoots = [
  'src/modules/files/app',
  'src/modules/files/features',
  'src/modules/files/ui',
  'src/modules/files/components',
]
const siblingModuleAdapterOwnerPaths = new Set([
  chatSourceQueriesPath,
  favoriteQueriesPath,
  inboxApprovalQueriesPath,
  inboxApprovalSourcePath,
])
const siblingModuleImportPattern = /from\s+['"]@\/modules\/(?:chat|favorites|inbox)(?:\/|['"])/
const cacheInternalsImportPattern = /from\s+['"][^'"]*(?:data\/cache|data\/collections|\/collections|entry-transfer-overlays)[^'"]*['"]/
const reactQueryCacheApiPattern =
  /@tanstack\/react-query|\buseQueryClient\b|\bQueryClient\b|\.setQueryData\(|\.setQueriesData\(|\.getQueriesData\(|\.invalidateQueries\(|\.cancelQueries\(|\brunOptimisticMutation\b/
const queryOwnerCacheMechanicsPattern =
  /from\s+['"][^'"]*(?:data\/cache|\/cache\/|\.\.?\/cache)[^'"]*['"]|\.invalidateQueries\(|\.setQueryData\(|\.setQueriesData\(|\.getQueryData\(|\.getQueriesData\(|\.cancelQueries\(|\brunOptimisticMutation\b|\brestoreQuerySnapshot\b|\bFILES_COLLECTION_QUERY_KEYS\b|\bfilesResourceQueryKeys\b|\bstage(?:RawTextSave|ResourceCreate|Transfer|FolderCreate|Save)\b|\bcommit(?:RawTextSave|ResourceCreate|Transfer|FolderCreate|Save)\b/

function listProductionSourceFiles(rootPath: string): string[] {
  if (!existsSync(rootPath)) return []

  return readdirSync(rootPath).flatMap((entryName) => {
    const entryPath = `${rootPath}/${entryName}`
    if (statSync(entryPath).isDirectory()) return listProductionSourceFiles(entryPath)
    if (!/\.(ts|tsx)$/.test(entryName) || /\.(?:test|architecture\.test)\.(ts|tsx)$/.test(entryName)) return []
    return [entryPath]
  })
}

describe('Files data boundary', () => {
  it('keeps React query facade implementation under data/queries with a root compatibility shim', () => {
    expect(existsSync(queryFacadePath)).toBe(true)
    expect(existsSync(rootQueryShimPath)).toBe(true)
    if (!existsSync(queryFacadePath) || !existsSync(rootQueryShimPath)) return

    const queryFacadeSource = readFileSync(queryFacadePath, 'utf8')
    const rootShimSource = readFileSync(rootQueryShimPath, 'utf8')

    expect(queryFacadeSource).toContain("export * from './resource-queries'")
    expect(queryFacadeSource).toContain("export * from './sidecar-queries'")
    expect(queryFacadeSource).toContain("export * from './vocab-queries'")
    expect(queryFacadeSource).toContain("export * from './inbox-approval-queries'")
    expect(queryFacadeSource).toContain("export * from './favorite-queries'")
    expect(queryFacadeSource).toContain("export * from './chat-source-queries'")
    expect(rootShimSource).toMatch(/^export \* from '.\/data\/queries'\n?$/)
  })

  it('keeps data query owners from implementing cache patches or invalidation directly', () => {
    const queryOwnerFiles = listProductionSourceFiles(queryOwnersRootPath)

    expect(queryOwnerFiles.length).toBeGreaterThan(0)

    for (const filePath of queryOwnerFiles) {
      const source = readFileSync(filePath, 'utf8')

      expect(
        source,
        `${filePath} implements cache mechanics; query hooks should pass cacheClient into collection owners`,
      ).not.toMatch(queryOwnerCacheMechanicsPattern)
    }
  })

  it('keeps sibling module imports isolated to Files data adapter owners', () => {
    const productionFiles = listProductionSourceFiles(filesRootPath)

    expect(productionFiles.length).toBeGreaterThan(0)

    for (const filePath of productionFiles) {
      const source = readFileSync(filePath, 'utf8')
      if (!siblingModuleImportPattern.test(source)) continue

      expect(
        siblingModuleAdapterOwnerPaths.has(filePath),
        `${filePath} imports Chat/Favorites/Inbox directly; route it through a Files data adapter owner`,
      ).toBe(true)
    }
  })

  it('keeps collection/cache implementation under data/collections with a root compatibility shim', () => {
    expect(existsSync(collectionFacadePath)).toBe(true)
    expect(existsSync(rootCollectionShimPath)).toBe(true)
    if (!existsSync(collectionFacadePath) || !existsSync(rootCollectionShimPath)) return

    const collectionFacadeSource = readFileSync(collectionFacadePath, 'utf8')
    const rootShimSource = readFileSync(rootCollectionShimPath, 'utf8')

    expect(collectionFacadeSource).toContain('filesResourceQueryCollection')
    expect(collectionFacadeSource).toContain('filesResourceMutationCollection')
    expect(rootShimSource).toMatch(/^export \* from '.\/data\/collections'\n?$/)
  })

  it('keeps UI-facing Files modules out of collection/cache and React Query cache mutation internals', () => {
    const productionFiles = uiFacingProductionRoots.flatMap(listProductionSourceFiles)

    expect(productionFiles.length).toBeGreaterThan(0)

    for (const filePath of productionFiles) {
      const source = readFileSync(filePath, 'utf8')

      expect(
        source,
        `${filePath} imports Files collection/cache internals; route data reads/writes through data/queries hooks and collection owners`,
      ).not.toMatch(cacheInternalsImportPattern)
      expect(
        source,
        `${filePath} touches React Query cache mechanics; optimistic stage/commit/rollback belongs in data/collections + data/cache`,
      ).not.toMatch(reactQueryCacheApiPattern)
    }
  })

  it('keeps Files collection query-key registry in a dedicated owner module', () => {
    expect(existsSync(queryKeysCollectionPath)).toBe(true)
    if (!existsSync(queryKeysCollectionPath)) return

    const queryKeysSource = readFileSync(queryKeysCollectionPath, 'utf8')
    const collectionFacadeSource = readFileSync(collectionFacadePath, 'utf8')

    expect(queryKeysSource).toContain('export const FILES_COLLECTION_QUERY_KEYS')
    expect(queryKeysSource).toContain('export const filesResourceQueryKeys')
    expect(queryKeysSource).toContain("from '../../domain/list/entry-scope'")
    expect(queryKeysSource).toContain("from '../../domain/resource/resource-model'")
    expect(queryKeysSource).not.toContain("from '../collections'")
    expect(collectionFacadeSource).toContain("from './query-keys'")
    expect(collectionFacadeSource).not.toMatch(/\nexport const FILES_COLLECTION_QUERY_KEYS = \{/)
    expect(collectionFacadeSource).not.toMatch(/\nexport const filesResourceQueryKeys = \{/)
    expect(collectionFacadeSource).not.toMatch(/\n  roots\(workspaceUri\?: string \| null\)/)
    expect(collectionFacadeSource).not.toMatch(/\n  vocabDiscovery\(webId\?: string \| null/)
  })

  it('keeps Files collection runtime database state in a dedicated owner module', () => {
    expect(existsSync(runtimeCollectionPath)).toBe(true)
    if (!existsSync(runtimeCollectionPath)) return

    const runtimeSource = readFileSync(runtimeCollectionPath, 'utf8')
    const collectionFacadeSource = readFileSync(collectionFacadePath, 'utf8')

    expect(runtimeSource).toContain('export function createFilesDatabaseRuntime')
    expect(runtimeSource).toContain('setFilesDatabaseGetter')
    expect(runtimeSource).toContain('getDb')
    expect(runtimeSource).toContain('SolidDatabase')
    expect(collectionFacadeSource).toContain("from './runtime'")
    expect(collectionFacadeSource).toContain('createFilesDatabaseRuntime()')
    expect(collectionFacadeSource).not.toContain('let filesDatabaseGetter')
    expect(collectionFacadeSource).not.toContain('filesDatabaseGetter?.()')
    expect(collectionFacadeSource).not.toMatch(/\nexport function setFilesDatabaseGetter\(getter:/)
    expect(collectionFacadeSource).not.toMatch(/\nfunction getDb\(\)/)
  })

  it('keeps list entry-scope type in domain so data does not depend on the UI store', () => {
    expect(existsSync(entryScopeDomainPath)).toBe(true)
    if (!existsSync(entryScopeDomainPath)) return

    const entryScopeSource = readFileSync(entryScopeDomainPath, 'utf8')
    const queryFacadeSource = readFileSync(queryFacadePath, 'utf8')
    const resourceQueriesSource = existsSync(resourceQueriesPath)
      ? readFileSync(resourceQueriesPath, 'utf8')
      : ''
    const queryKeysSource = existsSync(queryKeysCollectionPath)
      ? readFileSync(queryKeysCollectionPath, 'utf8')
      : ''
    const collectionFacadeSource = readFileSync(collectionFacadePath, 'utf8')

    expect(entryScopeSource).toContain("export type FilesEntryScope = 'all' | 'chat-files'")
    expect(resourceQueriesSource).toContain("from '../../domain/list/entry-scope'")
    expect(queryKeysSource).toContain("from '../../domain/list/entry-scope'")
    expect(queryFacadeSource).not.toContain("from '../../store'")
    expect(resourceQueriesSource).not.toContain("from '../../store'")
    expect(queryKeysSource).not.toContain("from '../../store'")
    expect(collectionFacadeSource).not.toContain("from '../../store'")
    expect(queryFacadeSource).not.toContain("from '../../app/store'")
    expect(resourceQueriesSource).not.toContain("from '../../app/store'")
    expect(queryKeysSource).not.toContain("from '../../app/store'")
    expect(collectionFacadeSource).not.toContain("from '../../app/store'")
  })

  it('keeps data facades pointed at owner layers instead of root compatibility shims', () => {
    const queryFacadeSource = readFileSync(queryFacadePath, 'utf8')
    const collectionFacadeSource = readFileSync(collectionFacadePath, 'utf8')
    const proposalQueriesSource = existsSync(proposalQueriesPath)
      ? readFileSync(proposalQueriesPath, 'utf8')
      : ''
    const proposalCollectionsSource = existsSync(proposalCollectionsPath)
      ? readFileSync(proposalCollectionsPath, 'utf8')
      : ''

    for (const [filePath, source] of [
      [queryFacadePath, queryFacadeSource],
      [collectionFacadePath, collectionFacadeSource],
    ] as const) {
      expect(source, `${filePath} should not import the root browser shim`).not.toContain("from '../../browser'")
      expect(source, `${filePath} should not import the root structured-table shim`).not.toContain("from '../../structured-table'")
    }

    const resourceQueriesSource = existsSync(resourceQueriesPath)
      ? readFileSync(resourceQueriesPath, 'utf8')
      : ''

    expect(resourceQueriesSource).toContain("from '../../domain/resource/resource-model'")
    expect(resourceQueriesSource).toContain("from '../../domain/resource/tree-model'")
    expect(queryFacadeSource).not.toContain("from '../../domain/structured/structured-table'")
    expect(proposalQueriesSource).toContain("from '../../domain/structured/structured-table'")
    expect(collectionFacadeSource).toContain("from './proposal-collections'")
    expect(proposalCollectionsSource).toContain("from '../../domain/structured/structured-table'")
  })

  it('keeps resource query hooks in a dedicated data/queries owner module', () => {
    expect(existsSync(resourceQueriesPath)).toBe(true)
    if (!existsSync(resourceQueriesPath)) return

    const resourceQueriesSource = readFileSync(resourceQueriesPath, 'utf8')
    const queryFacadeSource = readFileSync(queryFacadePath, 'utf8')

    expect(resourceQueriesSource).toContain('export function useFilesRootNodes')
    expect(resourceQueriesSource).toContain('export function useFilesEntries')
    expect(resourceQueriesSource).toContain('export function useFileDetail')
    expect(resourceQueriesSource).toContain('export function useRawTextResource')
    expect(resourceQueriesSource).toContain('export function useBlobResource')
    expect(resourceQueriesSource).toContain('export function useSaveRawTextResource')
    expect(resourceQueriesSource).toContain('export function useCreateRawTextResource')
    expect(resourceQueriesSource).toContain('export function useCreateBlobResource')
    expect(resourceQueriesSource).toContain('export function useCopyFileResource')
    expect(resourceQueriesSource).toContain('export function useMoveFileResource')
    expect(resourceQueriesSource).toContain('export function useDeleteFileResource')
    expect(resourceQueriesSource).toContain('export function useCreateFolderResource')
    expect(resourceQueriesSource).toContain('export function resolveSelectedFilesNode')
    expect(resourceQueriesSource).toContain('filesResourceQueryCollection')
    expect(resourceQueriesSource).toContain('filesResourceMutationCollection')
    expect(resourceQueriesSource).toContain('useActiveFilesWorkspaceContext')
    expect(resourceQueriesSource).toContain('useFilesChatMessages')
    expect(resourceQueriesSource).toContain("from '../../domain/resource/resource-model'")
    expect(resourceQueriesSource).toContain("from '../../domain/resource/tree-model'")
    expect(resourceQueriesSource).toContain("from '../../domain/list/entry-scope'")
    expect(resourceQueriesSource).toContain("from '../collections'")
    expect(resourceQueriesSource).toContain("from './chat-source-queries'")
    expect(resourceQueriesSource).not.toContain('@/modules/chat/collections')
    expect(resourceQueriesSource).not.toContain('@/modules/chat/store')
    expect(resourceQueriesSource).not.toMatch(/\buseThreadList\b/)
    expect(resourceQueriesSource).not.toMatch(/\buseMessageList\b/)
    expect(resourceQueriesSource).not.toMatch(/\buseChatStore\b/)
    expect(queryFacadeSource).toContain("export * from './resource-queries'")
    expect(queryFacadeSource).not.toMatch(/\nexport function useFilesRootNodes\b/)
    expect(queryFacadeSource).not.toMatch(/\nexport function useFilesEntries\b/)
    expect(queryFacadeSource).not.toMatch(/\nexport function useFileDetail\b/)
    expect(queryFacadeSource).not.toMatch(/\nexport function useRawTextResource\b/)
    expect(queryFacadeSource).not.toMatch(/\nexport function useBlobResource\b/)
    expect(queryFacadeSource).not.toMatch(/\nexport function useSaveRawTextResource\b/)
    expect(queryFacadeSource).not.toMatch(/\nexport function useCreateRawTextResource\b/)
    expect(queryFacadeSource).not.toMatch(/\nexport function useCreateBlobResource\b/)
    expect(queryFacadeSource).not.toMatch(/\nexport function useCopyFileResource\b/)
    expect(queryFacadeSource).not.toMatch(/\nexport function useMoveFileResource\b/)
    expect(queryFacadeSource).not.toMatch(/\nexport function useDeleteFileResource\b/)
    expect(queryFacadeSource).not.toMatch(/\nexport function useCreateFolderResource\b/)
    expect(queryFacadeSource).not.toContain('filesResourceQueryCollection')
    expect(queryFacadeSource).not.toContain('filesResourceMutationCollection')
  })

  it('keeps cross-module Chat source hooks behind a Files query adapter owner', () => {
    expect(existsSync(chatSourceQueriesPath)).toBe(true)
    if (!existsSync(chatSourceQueriesPath)) return

    const chatSourceQueriesSource = readFileSync(chatSourceQueriesPath, 'utf8')
    const queryFacadeSource = readFileSync(queryFacadePath, 'utf8')

    expect(chatSourceQueriesSource).toContain('@/modules/chat/collections')
    expect(chatSourceQueriesSource).toContain('@/modules/chat/store')
    expect(chatSourceQueriesSource).toContain('export interface ActiveFilesWorkspaceContext')
    expect(chatSourceQueriesSource).toContain('export function useActiveFilesWorkspaceContext')
    expect(chatSourceQueriesSource).toContain('export function useFilesChatMessages')
    expect(chatSourceQueriesSource).toContain('useThreadList')
    expect(chatSourceQueriesSource).toContain('useMessageList')
    expect(chatSourceQueriesSource).toContain('useChatStore')
    expect(queryFacadeSource).toContain("export * from './chat-source-queries'")
  })

  it('keeps sidecar query hooks in a dedicated data/queries owner module', () => {
    expect(existsSync(sidecarQueriesPath)).toBe(true)
    if (!existsSync(sidecarQueriesPath)) return

    const sidecarQueriesSource = readFileSync(sidecarQueriesPath, 'utf8')
    const queryFacadeSource = readFileSync(queryFacadePath, 'utf8')

    expect(sidecarQueriesSource).toContain('export function useFilesAccessBasics')
    expect(sidecarQueriesSource).toContain('export function useFilesMetaSidecar')
    expect(sidecarQueriesSource).toContain('export function useStructuredViewMetadata')
    expect(sidecarQueriesSource).toContain('export function useSaveStructuredViewMetadata')
    expect(sidecarQueriesSource).toContain('filesSidecarQueryCollection')
    expect(sidecarQueriesSource).toContain('filesSidecarMutationCollection')
    expect(sidecarQueriesSource).toContain('StructuredViewMetadata')
    expect(sidecarQueriesSource).toContain("from '../../domain/resource/resource-model'")
    expect(sidecarQueriesSource).toContain("from '../../domain/structured/structured-view-metadata'")
    expect(sidecarQueriesSource).toContain("from '../collections'")
    expect(queryFacadeSource).toContain("export * from './sidecar-queries'")
    expect(queryFacadeSource).not.toMatch(/\nexport function useFilesAccessBasics\b/)
    expect(queryFacadeSource).not.toMatch(/\nexport function useFilesMetaSidecar\b/)
    expect(queryFacadeSource).not.toMatch(/\nexport function useStructuredViewMetadata\b/)
    expect(queryFacadeSource).not.toMatch(/\nexport function useSaveStructuredViewMetadata\b/)
    expect(queryFacadeSource).not.toContain('filesSidecarQueryCollection')
    expect(queryFacadeSource).not.toContain('filesSidecarMutationCollection')
  })

  it('keeps vocab discovery query hooks in a dedicated data/queries owner module', () => {
    expect(existsSync(vocabQueriesPath)).toBe(true)
    if (!existsSync(vocabQueriesPath)) return

    const vocabQueriesSource = readFileSync(vocabQueriesPath, 'utf8')
    const queryFacadeSource = readFileSync(queryFacadePath, 'utf8')

    expect(vocabQueriesSource).toContain('export function useFilesVocabRegistryDiscovery')
    expect(vocabQueriesSource).toContain('useSession')
    expect(vocabQueriesSource).toContain('filesVocabDiscoveryQueryCollection')
    expect(vocabQueriesSource).toContain('FilesVocabDiscoveryResult')
    expect(vocabQueriesSource).toContain("from '../collections'")
    expect(queryFacadeSource).toContain("export * from './vocab-queries'")
    expect(queryFacadeSource).not.toMatch(/\nexport function useFilesVocabRegistryDiscovery\b/)
    expect(queryFacadeSource).not.toContain('filesVocabDiscoveryQueryCollection')
  })

  it('keeps Source Ingest query hooks in a dedicated data/queries owner module', () => {
    expect(existsSync(sourceIngestQueriesPath)).toBe(true)
    if (!existsSync(sourceIngestQueriesPath)) return

    const sourceIngestQueriesSource = readFileSync(sourceIngestQueriesPath, 'utf8')
    const queryFacadeSource = readFileSync(queryFacadePath, 'utf8')

    expect(sourceIngestQueriesSource).toContain('export function useCreateSourceIngest')
    expect(sourceIngestQueriesSource).toContain('export function useRefreshSourceLinkedCard')
    expect(sourceIngestQueriesSource).toContain('export function useRequestSourceIngestRange')
    expect(sourceIngestQueriesSource).toContain('export function useMarkSourceIngestRangeIngested')
    expect(sourceIngestQueriesSource).toContain("from '../collections'")
    expect(sourceIngestQueriesSource).toContain("from '../../domain/source/source-ingest'")
    expect(sourceIngestQueriesSource).toContain("from '../../domain/source/source-ingest-manifest'")
    expect(queryFacadeSource).toContain("export * from './source-ingest-queries'")
    expect(queryFacadeSource).not.toMatch(/\nexport function useCreateSourceIngest\b/)
    expect(queryFacadeSource).not.toMatch(/\nexport function useRefreshSourceLinkedCard\b/)
    expect(queryFacadeSource).not.toMatch(/\nexport function useRequestSourceIngestRange\b/)
    expect(queryFacadeSource).not.toMatch(/\nexport function useMarkSourceIngestRangeIngested\b/)
  })

  it('keeps proposal query hooks in a dedicated data/queries owner module', () => {
    expect(existsSync(proposalQueriesPath)).toBe(true)
    if (!existsSync(proposalQueriesPath)) return

    const proposalQueriesSource = readFileSync(proposalQueriesPath, 'utf8')
    const queryFacadeSource = readFileSync(queryFacadePath, 'utf8')

    expect(proposalQueriesSource).toContain('export function useApproveVocabTermProposal')
    expect(proposalQueriesSource).toContain('export function useCreateVocabTermProposalInboxApproval')
    expect(proposalQueriesSource).toContain('export function usePendingVocabTermProposals')
    expect(proposalQueriesSource).toContain('export function useCreateAccessPolicyProposal')
    expect(proposalQueriesSource).toContain('export function usePendingAccessPolicyProposals')
    expect(proposalQueriesSource).toContain('export function useCreateSourceUpdateProposal')
    expect(proposalQueriesSource).toContain('export function usePendingSourceUpdateProposals')
    expect(proposalQueriesSource).toContain('export function useCreateAiChangeProposal')
    expect(proposalQueriesSource).toContain('export function usePendingStructuredCellChangeProposals')
    expect(proposalQueriesSource).toContain('export function useCreateStructuredCellChangeProposal')
    expect(proposalQueriesSource).toContain("from '../collections'")
    expect(proposalQueriesSource).toContain("from '../../domain/proposal/access-approval-model'")
    expect(proposalQueriesSource).toContain("from '../../domain/source/source-approval-model'")
    expect(proposalQueriesSource).toContain("from '../../domain/proposal/structured-cell-approval-model'")
    expect(queryFacadeSource).toContain("export * from './proposal-queries'")
    expect(queryFacadeSource).not.toMatch(/\nexport function useApproveVocabTermProposal\b/)
    expect(queryFacadeSource).not.toMatch(/\nexport function useCreateVocabTermProposalInboxApproval\b/)
    expect(queryFacadeSource).not.toMatch(/\nexport function usePendingVocabTermProposals\b/)
    expect(queryFacadeSource).not.toMatch(/\nexport function useCreateAccessPolicyProposal\b/)
    expect(queryFacadeSource).not.toMatch(/\nexport function usePendingAccessPolicyProposals\b/)
    expect(queryFacadeSource).not.toMatch(/\nexport function useCreateSourceUpdateProposal\b/)
    expect(queryFacadeSource).not.toMatch(/\nexport function usePendingSourceUpdateProposals\b/)
    expect(queryFacadeSource).not.toMatch(/\nexport function useCreateAiChangeProposal\b/)
    expect(queryFacadeSource).not.toMatch(/\nexport function usePendingStructuredCellChangeProposals\b/)
    expect(queryFacadeSource).not.toMatch(/\nexport function useCreateStructuredCellChangeProposal\b/)
    expect(queryFacadeSource).not.toContain('accessPolicyProposalCollection')
    expect(queryFacadeSource).not.toContain('structuredCellProposalCollection')
    expect(queryFacadeSource).not.toContain('vocabTermProposalCollection')
    expect(queryFacadeSource).not.toContain('sourceUpdateProposalCollection')
    expect(queryFacadeSource).not.toContain('aiChangeProposalCollection')
  })

  it('keeps Source Ingest collection workflow in a dedicated owner module', () => {
    expect(existsSync(sourceIngestCollectionPath)).toBe(true)
    if (!existsSync(sourceIngestCollectionPath)) return

    const sourceIngestCollectionSource = readFileSync(sourceIngestCollectionPath, 'utf8')
    const collectionFacadeSource = readFileSync(collectionFacadePath, 'utf8')

    expect(sourceIngestCollectionSource).toContain('export function createSourceIngestCollection')
    expect(sourceIngestCollectionSource).toContain('sourceIngestUseCases')
    expect(sourceIngestCollectionSource).toContain('sourceIngestCreateCacheCollection')
    expect(sourceIngestCollectionSource).toContain('sourceIngestManifestCacheCollection')
    expect(sourceIngestCollectionSource).toContain('sourceIngestRefreshCacheCollection')
    expect(sourceIngestCollectionSource).not.toContain("from '../collections'")
    expect(collectionFacadeSource).toContain("from './source-ingest-collection'")
    expect(collectionFacadeSource).toContain('export const sourceIngestCollection = createSourceIngestCollection')
    expect(collectionFacadeSource).not.toMatch(/\nexport const sourceIngestCollection = \{/)
    expect(collectionFacadeSource).not.toMatch(/\n  async buildCreatePlan\(/)
    expect(collectionFacadeSource).not.toMatch(/\n  async refreshWithCache\(/)
    expect(collectionFacadeSource).not.toMatch(/\n  async requestRangeWithCache\(/)
    expect(collectionFacadeSource).not.toMatch(/\n  async markRangeIngestedWithCache\(/)
  })

  it('keeps proposal collection workflows in a dedicated owner module', () => {
    expect(existsSync(proposalCollectionsPath)).toBe(true)
    if (!existsSync(proposalCollectionsPath)) return

    const proposalCollectionsSource = readFileSync(proposalCollectionsPath, 'utf8')
    const collectionFacadeSource = readFileSync(collectionFacadePath, 'utf8')

    expect(proposalCollectionsSource).toContain('export function createProposalCollections')
    expect(proposalCollectionsSource).toContain('structuredCellProposalUseCases')
    expect(proposalCollectionsSource).toContain('vocabTermProposalUseCases')
    expect(proposalCollectionsSource).toContain('accessPolicyProposalUseCases')
    expect(proposalCollectionsSource).toContain('sourceUpdateProposalUseCases')
    expect(proposalCollectionsSource).toContain('aiChangeProposalUseCases')
    expect(proposalCollectionsSource).toContain('filesProposalQueryCollection')
    expect(proposalCollectionsSource).not.toContain("from '../collections'")
    expect(collectionFacadeSource).toContain("from './proposal-collections'")
    expect(collectionFacadeSource).toContain('createProposalCollections({')
    expect(collectionFacadeSource).not.toMatch(/\nexport const structuredCellProposalCollection = \{/)
    expect(collectionFacadeSource).not.toMatch(/\nexport const vocabTermProposalCollection = \{/)
    expect(collectionFacadeSource).not.toMatch(/\nexport const accessPolicyProposalCollection = \{/)
    expect(collectionFacadeSource).not.toMatch(/\nexport const sourceUpdateProposalCollection = \{/)
    expect(collectionFacadeSource).not.toMatch(/\nexport const aiChangeProposalCollection = \{/)
    expect(collectionFacadeSource).not.toMatch(/\nexport const filesProposalQueryCollection = \{/)
  })

  it('keeps cross-module Inbox approval reads in a dedicated adapter owner', () => {
    expect(existsSync(inboxApprovalSourcePath)).toBe(true)
    if (!existsSync(inboxApprovalSourcePath)) return

    const inboxApprovalSource = readFileSync(inboxApprovalSourcePath, 'utf8')
    const collectionFacadeSource = readFileSync(collectionFacadePath, 'utf8')

    expect(inboxApprovalSource).toContain('export function fetchFilesInboxApprovals')
    expect(inboxApprovalSource).toContain('@/modules/inbox/collections')
    expect(inboxApprovalSource).toContain('inboxOps.fetchApprovals')
    expect(inboxApprovalSource).not.toContain("from '../collections'")
    expect(collectionFacadeSource).toContain("from './inbox-approval-source'")
    expect(collectionFacadeSource).toContain('fetchApprovals: fetchFilesInboxApprovals')
    expect(collectionFacadeSource).not.toContain('@/modules/inbox/collections')
    expect(collectionFacadeSource).not.toContain('inboxOps')
    expect(collectionFacadeSource).not.toMatch(/\nfunction fetchInboxApprovals\(/)
  })

  it('keeps cross-module Inbox approval React hooks behind a Files query adapter owner', () => {
    expect(existsSync(inboxApprovalQueriesPath)).toBe(true)
    if (!existsSync(inboxApprovalQueriesPath)) return

    const inboxApprovalQueriesSource = readFileSync(inboxApprovalQueriesPath, 'utf8')
    const queryFacadeSource = readFileSync(queryFacadePath, 'utf8')

    expect(inboxApprovalQueriesSource).toContain('@/modules/inbox/collections')
    expect(inboxApprovalQueriesSource).toContain('export function useFilesApprovalByTarget')
    expect(inboxApprovalQueriesSource).toContain('export function useResolveFilesInboxApproval')
    expect(inboxApprovalQueriesSource).toContain('useApprovalByTarget')
    expect(inboxApprovalQueriesSource).toContain('useResolveInboxApproval')
    expect(queryFacadeSource).toContain("export * from './inbox-approval-queries'")
  })

  it('keeps cross-module Favorites React hooks behind a Files query adapter owner', () => {
    expect(existsSync(favoriteQueriesPath)).toBe(true)
    if (!existsSync(favoriteQueriesPath)) return

    const favoriteQueriesSource = readFileSync(favoriteQueriesPath, 'utf8')
    const queryFacadeSource = readFileSync(queryFacadePath, 'utf8')

    expect(favoriteQueriesSource).toContain('@/modules/favorites/collections')
    expect(favoriteQueriesSource).toContain('export function useFilesFavoriteList')
    expect(favoriteQueriesSource).toContain('export const filesFavoriteHooks')
    expect(favoriteQueriesSource).toContain('useFavoriteList')
    expect(favoriteQueriesSource).toContain('favoriteHooks')
    expect(queryFacadeSource).toContain("export * from './favorite-queries'")
  })

  it('keeps vocab discovery collection workflow in a dedicated owner module', () => {
    expect(existsSync(vocabDiscoveryCollectionPath)).toBe(true)
    if (!existsSync(vocabDiscoveryCollectionPath)) return

    const vocabDiscoveryCollectionSource = readFileSync(vocabDiscoveryCollectionPath, 'utf8')
    const collectionFacadeSource = readFileSync(collectionFacadePath, 'utf8')

    expect(vocabDiscoveryCollectionSource).toContain('export function createVocabDiscoveryCollections')
    expect(vocabDiscoveryCollectionSource).toContain('export const FILES_VOCAB_REGISTRY_CLASS_URI')
    expect(vocabDiscoveryCollectionSource).toContain('export type FilesVocabDiscoveryResult')
    expect(vocabDiscoveryCollectionSource).toContain('createSolidTypeIndexResourceTextReader')
    expect(vocabDiscoveryCollectionSource).toContain('discoverSolidTypeIndexRegistrationsFromWebId')
    expect(vocabDiscoveryCollectionSource).not.toContain("from '../collections'")
    expect(collectionFacadeSource).toContain("from './vocab-discovery-collection'")
    expect(collectionFacadeSource).toContain('createVocabDiscoveryCollections({')
    expect(collectionFacadeSource).not.toMatch(/\nexport const filesVocabDiscoveryCollection = \{/)
    expect(collectionFacadeSource).not.toMatch(/\nexport const filesVocabDiscoveryQueryCollection = \{/)
    expect(collectionFacadeSource).not.toContain('discoverSolidTypeIndexRegistrationsFromWebId')
    expect(collectionFacadeSource).not.toContain('createSolidTypeIndexResourceTextReader')
  })

  it('keeps Files Pod subscription workflow in a dedicated owner module', () => {
    expect(existsSync(subscriptionCollectionPath)).toBe(true)
    if (!existsSync(subscriptionCollectionPath)) return

    const subscriptionCollectionSource = readFileSync(subscriptionCollectionPath, 'utf8')
    const collectionFacadeSource = readFileSync(collectionFacadePath, 'utf8')

    expect(subscriptionCollectionSource).toContain('export function createFilesSubscriptionCollection')
    expect(subscriptionCollectionSource).toContain('approvalResource')
    expect(subscriptionCollectionSource).toContain('subscribeToPod')
    expect(subscriptionCollectionSource).toContain('invalidateAllFilesRoots')
    expect(subscriptionCollectionSource).not.toContain("from '../collections'")
    expect(collectionFacadeSource).toContain("from './subscription-collection'")
    expect(collectionFacadeSource).toContain('createFilesSubscriptionCollection({')
    expect(collectionFacadeSource).not.toContain('approvalResource')
    expect(collectionFacadeSource).not.toMatch(/\n  async subscribeToPod\(/)
    expect(collectionFacadeSource).not.toContain('db.subscribe')
    expect(collectionFacadeSource).not.toContain('[filesOps] Failed to subscribe Files proposal dependencies')
  })

  it('keeps resource mutation cache workflow in a dedicated owner module', () => {
    expect(existsSync(resourceMutationCollectionPath)).toBe(true)
    if (!existsSync(resourceMutationCollectionPath)) return

    const resourceMutationCollectionSource = readFileSync(resourceMutationCollectionPath, 'utf8')
    const collectionFacadeSource = readFileSync(collectionFacadePath, 'utf8')

    expect(resourceMutationCollectionSource).toContain('export function createResourceMutationCollection')
    expect(resourceMutationCollectionSource).toContain('stageRawTextSave')
    expect(resourceMutationCollectionSource).toContain('stageResourceCreate')
    expect(resourceMutationCollectionSource).toContain('stageTransfer')
    expect(resourceMutationCollectionSource).toContain('stageFolderCreate')
    expect(resourceMutationCollectionSource).toContain('createRawTextResourceWithCache')
    expect(resourceMutationCollectionSource).not.toContain("from '../collections'")
    expect(collectionFacadeSource).toContain("from './resource-mutation-collection'")
    expect(collectionFacadeSource).toContain('createResourceMutationCollection({')
    expect(collectionFacadeSource).not.toMatch(/\nexport const filesResourceMutationCollection = \{/)
    expect(collectionFacadeSource).not.toContain('stageRawTextSave')
    expect(collectionFacadeSource).not.toContain('stageResourceCreate')
    expect(collectionFacadeSource).not.toContain('stageTransfer')
    expect(collectionFacadeSource).not.toContain('stageFolderCreate')
    expect(collectionFacadeSource).not.toContain('createRawTextResourceWithCache')
  })

  it('keeps sidecar mutation cache workflow in a dedicated owner module', () => {
    expect(existsSync(sidecarMutationCollectionPath)).toBe(true)
    if (!existsSync(sidecarMutationCollectionPath)) return

    const sidecarMutationCollectionSource = readFileSync(sidecarMutationCollectionPath, 'utf8')
    const resourceMutationCollectionSource = readFileSync(resourceMutationCollectionPath, 'utf8')
    const collectionFacadeSource = readFileSync(collectionFacadePath, 'utf8')

    expect(sidecarMutationCollectionSource).toContain('export function createSidecarMutationCollection')
    expect(sidecarMutationCollectionSource).toContain('saveStructuredViewMetadata')
    expect(sidecarMutationCollectionSource).toContain('stageSave')
    expect(sidecarMutationCollectionSource).toContain('commitSave')
    expect(sidecarMutationCollectionSource).toContain('invalidateSave')
    expect(sidecarMutationCollectionSource).toContain('saveStructuredViewMetadataResource')
    expect(sidecarMutationCollectionSource).not.toContain("from '../collections'")
    expect(collectionFacadeSource).toContain("from './sidecar-mutation-collection'")
    expect(collectionFacadeSource).toContain('createSidecarMutationCollection({')
    expect(collectionFacadeSource).toContain('filesSidecarMutationCollection')
    expect(resourceMutationCollectionSource).not.toContain('saveStructuredViewMetadata')
    expect(resourceMutationCollectionSource).not.toContain('stageSave')
    expect(resourceMutationCollectionSource).not.toContain('commitSave')
    expect(resourceMutationCollectionSource).not.toContain('invalidateSave')
  })

  it('keeps resource query wrappers in a dedicated owner module', () => {
    expect(existsSync(resourceQueryCollectionPath)).toBe(true)
    if (!existsSync(resourceQueryCollectionPath)) return

    const resourceQueryCollectionSource = readFileSync(resourceQueryCollectionPath, 'utf8')
    const collectionFacadeSource = readFileSync(collectionFacadePath, 'utf8')

    expect(resourceQueryCollectionSource).toContain('export function createResourceQueryCollection')
    expect(resourceQueryCollectionSource).toContain('resolveCurrentPodRootUri')
    expect(resourceQueryCollectionSource).toContain('roots(input:')
    expect(resourceQueryCollectionSource).toContain('children(input:')
    expect(resourceQueryCollectionSource).toContain('entries(input:')
    expect(resourceQueryCollectionSource).not.toContain("from '../collections'")
    expect(collectionFacadeSource).toContain("from './resource-query-collection'")
    expect(collectionFacadeSource).toContain('createResourceQueryCollection({')
    expect(collectionFacadeSource).not.toMatch(/\nexport const filesResourceQueryCollection = \{/)
    expect(collectionFacadeSource).not.toContain('return filesResourceCollection.buildRoots(input.workspaceUri, input.db)')
    expect(collectionFacadeSource).not.toContain('return filesResourceCollection.listEntries({')
  })

  it('keeps sidecar read query wrappers in a dedicated owner module', () => {
    expect(existsSync(sidecarQueryCollectionPath)).toBe(true)
    if (!existsSync(sidecarQueryCollectionPath)) return

    const sidecarQueryCollectionSource = readFileSync(sidecarQueryCollectionPath, 'utf8')
    const resourceQueryCollectionSource = readFileSync(resourceQueryCollectionPath, 'utf8')
    const collectionFacadeSource = readFileSync(collectionFacadePath, 'utf8')
    const sidecarQueriesSource = existsSync(sidecarQueriesPath)
      ? readFileSync(sidecarQueriesPath, 'utf8')
      : ''

    expect(sidecarQueryCollectionSource).toContain('export function createSidecarQueryCollection')
    expect(sidecarQueryCollectionSource).toContain('accessBasics(input:')
    expect(sidecarQueryCollectionSource).toContain('metaSidecar(input:')
    expect(sidecarQueryCollectionSource).toContain('structuredViewMetadata(input:')
    expect(sidecarQueryCollectionSource).toContain('readFilesAccessBasics')
    expect(sidecarQueryCollectionSource).toContain('readFilesMetaSidecar')
    expect(sidecarQueryCollectionSource).toContain('readStructuredViewMetadata')
    expect(sidecarQueryCollectionSource).not.toContain("from '../collections'")
    expect(collectionFacadeSource).toContain("from './sidecar-query-collection'")
    expect(collectionFacadeSource).toContain('createSidecarQueryCollection({')
    expect(collectionFacadeSource).toContain('filesSidecarQueryCollection')
    expect(sidecarQueriesSource).toContain('filesSidecarQueryCollection')
    expect(resourceQueryCollectionSource).not.toContain('accessBasics(input:')
    expect(resourceQueryCollectionSource).not.toContain('metaSidecar(input:')
    expect(resourceQueryCollectionSource).not.toContain('structuredViewMetadata(input:')
    expect(resourceQueryCollectionSource).not.toContain('readAccessBasics')
    expect(resourceQueryCollectionSource).not.toContain('readMetaSidecar')
    expect(resourceQueryCollectionSource).not.toContain('readStructuredViewMetadata')
    expect(collectionFacadeSource).not.toContain('return filesResourceCollection.readAccessBasics(input.file, input.db)')
    expect(collectionFacadeSource).not.toContain('return filesResourceCollection.readMetaSidecar(input.file, input.db)')
    expect(collectionFacadeSource).not.toContain('return filesResourceCollection.readStructuredViewMetadata(input.file, input.db)')
  })

  it('keeps resource collection adapter wrappers and list strategy in a dedicated owner module', () => {
    expect(existsSync(resourceCollectionPath)).toBe(true)
    if (!existsSync(resourceCollectionPath)) return

    const resourceCollectionSource = readFileSync(resourceCollectionPath, 'utf8')
    const collectionFacadeSource = readFileSync(collectionFacadePath, 'utf8')

    expect(resourceCollectionSource).toContain('export function createResourceCollection')
    expect(resourceCollectionSource).toContain('resolveCurrentPodBaseUrl')
    expect(resourceCollectionSource).toContain('listAllBrowsableEntries')
    expect(resourceCollectionSource).toContain('mergeChatFileEntries')
    expect(resourceCollectionSource).toContain('confirmedEntryTransferOverlays.merge')
    expect(resourceCollectionSource).not.toContain("from '../collections'")
    expect(collectionFacadeSource).toContain("from './resource-collection'")
    expect(collectionFacadeSource).toContain('createResourceCollection({')
    expect(collectionFacadeSource).not.toMatch(/\nexport const filesResourceCollection = \{/)
    expect(collectionFacadeSource).not.toContain('listAllBrowsableEntries')
    expect(collectionFacadeSource).not.toContain('mergeChatFileEntries')
    expect(collectionFacadeSource).not.toContain('resolveCurrentPodBaseUrl')
  })

  it('keeps confirmed entry transfer overlays under data/cache with a root compatibility shim', () => {
    expect(existsSync(entryTransferOverlaysPath)).toBe(true)
    expect(existsSync(rootEntryTransferOverlaysShimPath)).toBe(true)
    if (!existsSync(entryTransferOverlaysPath) || !existsSync(rootEntryTransferOverlaysShimPath)) return

    const overlaySource = readFileSync(entryTransferOverlaysPath, 'utf8')
    const collectionSource = readFileSync(collectionFacadePath, 'utf8')
    const rootShimSource = readFileSync(rootEntryTransferOverlaysShimPath, 'utf8')

    expect(overlaySource).toContain('export function createConfirmedEntryTransferOverlayStore')
    expect(overlaySource).toContain('export type ConfirmedEntryTransferOverlayStore')
    expect(collectionSource).toContain("from '../cache/entry-transfer-overlays'")
    expect(rootShimSource).toMatch(/^export \* from '.\/data\/cache\/entry-transfer-overlays'\n?$/)
  })

  it('keeps entry-list optimistic cache collection under data/cache instead of collections', () => {
    expect(existsSync(filesEntryCachePath)).toBe(true)
    if (!existsSync(filesEntryCachePath)) return

    const cacheSource = readFileSync(filesEntryCachePath, 'utf8')
    const collectionSource = readFileSync(collectionFacadePath, 'utf8')

    expect(cacheSource).toContain('export type FilesEntryCacheSnapshot')
    expect(cacheSource).toMatch(/\nexport function createFilesEntryCacheCollection\b/)
    expect(cacheSource).toContain('stageRawTextSave')
    expect(cacheSource).toContain('stageTransfer')
    expect(cacheSource).toContain('optimisticEntryForTransfer')
    expect(collectionSource).toContain("from '../cache/files-entry-cache'")
    expect(collectionSource).not.toMatch(/\nexport type FilesEntryCacheSnapshot\b/)
    expect(collectionSource).not.toMatch(/\nexport const filesEntryCacheCollection\b/)
    expect(collectionSource).not.toMatch(/\nfunction findEntryInSnapshot\b/)
  })

  it('keeps reusable React query cache mechanics under data/cache instead of collections', () => {
    expect(existsSync(resourceQueryCachePath)).toBe(true)
    if (!existsSync(resourceQueryCachePath)) return

    const cacheSource = readFileSync(resourceQueryCachePath, 'utf8')
    const collectionSource = readFileSync(collectionFacadePath, 'utf8')
    const resourceMutationCollectionSource = existsSync(resourceMutationCollectionPath)
      ? readFileSync(resourceMutationCollectionPath, 'utf8')
      : ''

    expect(cacheSource).toContain('export function restoreQuerySnapshot')
    expect(cacheSource).toContain('export function setCachedEntryLists')
    expect(cacheSource).toContain('export function rawTextQueryKey')
    expect(cacheSource).toContain('export function rawTextCacheSnapshot')
    expect(cacheSource).toContain('export function writeRawTextCache')
    expect(cacheSource).toContain('export async function createRawTextResourceWithCache')
    expect(resourceMutationCollectionSource).toContain("from '../cache/resource-query-cache'")
    expect(collectionSource).not.toContain("from '../cache/resource-query-cache'")
    expect(collectionSource).not.toMatch(/\nfunction restoreQuerySnapshot\b/)
    expect(collectionSource).not.toMatch(/\nfunction setCachedEntryLists\b/)
    expect(collectionSource).not.toMatch(/\nfunction rawTextQueryKey\b/)
    expect(collectionSource).not.toMatch(/\nfunction rawTextCacheSnapshot\b/)
    expect(collectionSource).not.toMatch(/\nfunction writeRawTextCache\b/)
    expect(collectionSource).not.toContain('rawTextCacheSnapshot')
    expect(collectionSource).not.toContain('writeRawTextCache')
    expect(collectionSource).not.toContain('restoreQuerySnapshot')
    expect(collectionSource).not.toContain('rawTextQueryKey')
  })

  it('keeps generic optimistic mutation sequencing under data/cache instead of collection owners', () => {
    expect(existsSync(optimisticMutationCachePath)).toBe(true)
    if (!existsSync(optimisticMutationCachePath)) return

    const cacheSource = readFileSync(optimisticMutationCachePath, 'utf8')
    const resourceMutationSource = existsSync(resourceMutationCollectionPath)
      ? readFileSync(resourceMutationCollectionPath, 'utf8')
      : ''
    const sidecarMutationSource = existsSync(sidecarMutationCollectionPath)
      ? readFileSync(sidecarMutationCollectionPath, 'utf8')
      : ''

    expect(cacheSource).toMatch(/\nexport async function runOptimisticMutation\b/)
    expect(resourceMutationSource).toContain("from '../cache/optimistic-mutation'")
    expect(sidecarMutationSource).toContain("from '../cache/optimistic-mutation'")
    expect(resourceMutationSource).not.toMatch(/catch\s*\(\s*error\s*\)\s*{[\s\S]*?\.restore\(/)
    expect(sidecarMutationSource).not.toMatch(/catch\s*\(\s*error\s*\)\s*{[\s\S]*?\.restore\(/)
  })

  it('keeps generic proposal query cache mechanics under data/cache instead of collections', () => {
    expect(existsSync(proposalQueryCachePath)).toBe(true)
    if (!existsSync(proposalQueryCachePath)) return

    const cacheSource = readFileSync(proposalQueryCachePath, 'utf8')
    const collectionSource = readFileSync(collectionFacadePath, 'utf8')

    expect(cacheSource).toContain('export type FilesProposalCacheSnapshot')
    expect(cacheSource).toContain('export const filesProposalCacheCollection')
    expect(cacheSource).toContain('export function createScopedFilesProposalCacheCollection')
    expect(cacheSource).toContain('export async function createFilesProposalWithCache')
    expect(cacheSource).toContain('stageCreate')
    expect(cacheSource).toContain('restore')
    expect(collectionSource).toContain("from '../cache/proposal-query-cache'")
    expect(collectionSource).toContain('createFilesProposalWithCache')
    expect(collectionSource).not.toMatch(/\nexport type FilesProposalCacheSnapshot\b/)
    expect(collectionSource).not.toMatch(/\nexport const filesProposalCacheCollection\b/)
    expect(collectionSource).not.toMatch(/\nexport type StructuredCellProposalCacheSnapshot\b/)
    expect(collectionSource).not.toMatch(/\nexport const structuredCellProposalCacheCollection\b/)
    expect(collectionSource).not.toContain('cacheClient.getQueryData<StructuredCellChangeProposal[]>')
    expect(collectionSource).not.toContain('filesProposalCacheCollection.stageCreate')
    expect(collectionSource).not.toContain('filesProposalCacheCollection.restore')
  })

  it('keeps reusable query invalidation graph under data/cache instead of collections', () => {
    expect(existsSync(filesQueryInvalidationPath)).toBe(true)
    if (!existsSync(filesQueryInvalidationPath)) return

    const cacheSource = readFileSync(filesQueryInvalidationPath, 'utf8')
    const collectionSource = readFileSync(collectionFacadePath, 'utf8')

    expect(cacheSource).toMatch(/\nexport async function invalidateInboxQueryRoots\b/)
    expect(cacheSource).toMatch(/\nexport function createFilesResourceCacheInvalidationCollection\b/)
    expect(cacheSource).toContain('invalidateAllResourceRoots')
    expect(cacheSource).toContain('invalidateAllProposalRoots')
    expect(cacheSource).toContain('invalidateAllFilesRoots')
    expect(cacheSource).toContain('invalidateProposalList')
    expect(cacheSource).toContain('invalidateProposalCreate')
    expect(cacheSource).toContain('invalidateSourceIngestCreate')
    expect(cacheSource).toContain('invalidateSourceIngestRefresh')
    expect(cacheSource).toContain('invalidateSourceIngestManifest')
    expect(cacheSource).toContain('invalidateVocabApproval')
    expect(collectionSource).toContain("from '../cache/files-query-invalidation'")
    expect(collectionSource).not.toMatch(/\nasync function invalidateAllResourceQueryRoots\b/)
    expect(collectionSource).not.toMatch(/\nasync function invalidateAllProposalQueryRoots\b/)
    expect(collectionSource).not.toMatch(/\nasync function invalidateAllFilesQueryRoots\b/)
    expect(collectionSource).not.toContain('cacheClient.invalidateQueries')
    expect(collectionSource).not.toContain('cacheClient.invalidateQueries({ queryKey: [...FILES_COLLECTION_QUERY_KEYS.rawText, proposal.proposalResourceUri] })')
    expect(collectionSource).not.toContain('cacheClient.invalidateQueries({ queryKey: [...FILES_COLLECTION_QUERY_KEYS.detail, plan.targetResourceUri] })')
    expect(collectionSource).not.toContain('cacheClient.invalidateQueries({ queryKey: [...FILES_COLLECTION_QUERY_KEYS.rawText, result.manifest.manifestUri] })')
  })

  it('keeps source Ingest cache workflow under data/cache instead of collections', () => {
    expect(existsSync(sourceIngestCachePath)).toBe(true)
    if (!existsSync(sourceIngestCachePath)) return

    const cacheSource = readFileSync(sourceIngestCachePath, 'utf8')
    const collectionSource = readFileSync(collectionFacadePath, 'utf8')

    expect(cacheSource).toContain('export type SourceIngestCreateCacheSnapshot')
    expect(cacheSource).toContain('export type SourceIngestRefreshCacheSnapshot')
    expect(cacheSource).toMatch(/\nexport function createSourceIngestCacheCollections\b/)
    expect(cacheSource).toContain('sourceIngestManifestCacheCollection')
    expect(cacheSource).toContain('sourceIngestCreateCacheCollection')
    expect(cacheSource).toContain('sourceIngestRefreshCacheCollection')
    expect(collectionSource).toContain("from '../cache/source-ingest-cache'")
    expect(collectionSource).not.toMatch(/\nexport type SourceIngestCreateCacheSnapshot\b/)
    expect(collectionSource).not.toMatch(/\nexport type SourceIngestRefreshCacheSnapshot\b/)
    expect(collectionSource).not.toMatch(/\nfunction renderSourceIngestCardEntry\b/)
    expect(collectionSource).not.toMatch(/\nconst sourceIngestCreateCacheCollection = \{/)
    expect(collectionSource).not.toMatch(/\nconst sourceIngestRefreshCacheCollection = \{/)
  })

  it('keeps structured view metadata cache workflow under data/cache instead of collections', () => {
    expect(existsSync(structuredViewMetadataCachePath)).toBe(true)
    if (!existsSync(structuredViewMetadataCachePath)) return

    const cacheSource = readFileSync(structuredViewMetadataCachePath, 'utf8')
    const collectionSource = readFileSync(collectionFacadePath, 'utf8')

    expect(cacheSource).toContain('export type FilesStructuredViewMetadataCacheSnapshot')
    expect(cacheSource).toMatch(/\nexport function createStructuredViewMetadataCacheCollection\b/)
    expect(cacheSource).toContain('stageSave')
    expect(cacheSource).toContain('commitSave')
    expect(cacheSource).toContain('invalidateSave')
    expect(collectionSource).toContain("from '../cache/structured-view-metadata-cache'")
    expect(collectionSource).not.toMatch(/\nexport type FilesStructuredViewMetadataCacheSnapshot\b/)
    expect(collectionSource).not.toMatch(/\nfunction structuredViewMetadataKind\b/)
    expect(collectionSource).not.toMatch(/\nfunction structuredViewMetadataQueryKey\b/)
    expect(collectionSource).not.toMatch(/\nfunction completeStructuredViewMetadata\b/)
    expect(collectionSource).not.toMatch(/\nexport const filesStructuredViewMetadataCacheCollection\b/)
  })

  it('keeps source Ingest manifest resource IO under data/ingest with a root compatibility shim', () => {
    expect(existsSync(sourceIngestServicePath)).toBe(true)
    expect(existsSync(rootSourceIngestServiceShimPath)).toBe(true)
    if (!existsSync(sourceIngestServicePath) || !existsSync(rootSourceIngestServiceShimPath)) return

    const sourceIngestServiceSource = readFileSync(sourceIngestServicePath, 'utf8')
    const rootShimSource = readFileSync(rootSourceIngestServiceShimPath, 'utf8')

    expect(sourceIngestServiceSource).toContain('export function ensureSourceIngestManifestResource')
    expect(sourceIngestServiceSource).toContain('export function markSourceIngestRangeIngestedResource')
    expect(sourceIngestServiceSource).toContain("from '../pod-adapter'")
    expect(sourceIngestServiceSource).toContain("from '../../domain/source/source-ingest-manifest'")
    expect(rootShimSource).toMatch(/^export \* from '.\/data\/ingest\/source-ingest-service'\n?$/)
  })

  it('keeps source Ingest snapshot adapter boundary under data/ingest with a root compatibility shim', () => {
    expect(existsSync(sourceIngestSnapshotPath)).toBe(true)
    expect(existsSync(rootSourceIngestSnapshotShimPath)).toBe(true)
    if (!existsSync(sourceIngestSnapshotPath) || !existsSync(rootSourceIngestSnapshotShimPath)) return

    const sourceIngestSnapshotSource = readFileSync(sourceIngestSnapshotPath, 'utf8')
    const rootShimSource = readFileSync(rootSourceIngestSnapshotShimPath, 'utf8')

    expect(sourceIngestSnapshotSource).toContain('export interface SourceIngestSnapshotInput')
    expect(sourceIngestSnapshotSource).toContain('export async function createSourceIngestSnapshot')
    expect(sourceIngestSnapshotSource).toContain("from '../../domain/source/source-ingest'")
    expect(rootShimSource).toMatch(/^export \* from '.\/data\/ingest\/source-ingest-snapshot'\n?$/)
  })

  it('keeps legacy source extractor compatibility under data/ingest with a root compatibility shim', () => {
    expect(existsSync(sourceExtractorCompatPath)).toBe(true)
    expect(existsSync(rootSourceExtractorShimPath)).toBe(true)
    if (!existsSync(sourceExtractorCompatPath) || !existsSync(rootSourceExtractorShimPath)) return

    const sourceExtractorCompatSource = readFileSync(sourceExtractorCompatPath, 'utf8')
    const rootShimSource = readFileSync(rootSourceExtractorShimPath, 'utf8')

    expect(sourceExtractorCompatSource).toContain('export function createExtractedSourceSnapshot')
    expect(sourceExtractorCompatSource).toContain('extractDocument?: SourceIngestAdapter')
    expect(sourceExtractorCompatSource).toContain("from './source-ingest-snapshot'")
    expect(rootShimSource).toMatch(/^export \* from '.\/data\/ingest\/source-extractor-compat'\n?$/)
  })

  it('keeps Pod transport adapter under data/pod-adapter with a root browser compatibility shim', () => {
    expect(existsSync(podAdapterPath)).toBe(true)
    expect(existsSync(rootBrowserShimPath)).toBe(true)
    if (!existsSync(podAdapterPath) || !existsSync(rootBrowserShimPath)) return

    const podAdapterSource = readFileSync(podAdapterPath, 'utf8')
    const rootShimSource = readFileSync(rootBrowserShimPath, 'utf8')

    expect(podAdapterSource).toContain('export async function readFileDetail')
    expect(podAdapterSource).toContain('export function copyFileResource')
    expect(rootShimSource).toMatch(/^export \* from '.\/data\/pod-adapter'\n?$/)
  })

  it('keeps Pod runtime connection helpers in a dedicated pod-runtime module', () => {
    expect(existsSync(podRuntimePath)).toBe(true)
    if (!existsSync(podRuntimePath)) return

    const podRuntimeSource = readFileSync(podRuntimePath, 'utf8')
    const podAdapterSource = readFileSync(podAdapterPath, 'utf8')

    expect(podRuntimeSource).toContain('export function getPodRootUri')
    expect(podRuntimeSource).toContain('export function getAuthenticatedFetch')
    expect(podRuntimeSource).toContain('export function getContainerLister')
    expect(podAdapterSource).toContain("from './pod-runtime'")
    expect(podAdapterSource).not.toMatch(/\nfunction getDialect\(/)
    expect(podAdapterSource).not.toMatch(/\nfunction getAuthenticatedFetch\(/)
    expect(podAdapterSource).not.toMatch(/\nfunction getContainerLister\(/)
  })

  it('keeps vocab Type Index discovery under data/vocab with a root compatibility shim', () => {
    expect(existsSync(vocabDiscoveryPath)).toBe(true)
    expect(existsSync(rootVocabDiscoveryShimPath)).toBe(true)
    if (!existsSync(vocabDiscoveryPath) || !existsSync(rootVocabDiscoveryShimPath)) return

    const vocabDiscoverySource = readFileSync(vocabDiscoveryPath, 'utf8')
    const rootShimSource = readFileSync(rootVocabDiscoveryShimPath, 'utf8')

    expect(vocabDiscoverySource).toContain('export function createSolidTypeIndexResourceTextReader')
    expect(vocabDiscoverySource).toContain('export function discoverSolidTypeIndexRegistrations')
    expect(vocabDiscoverySource).toContain('export async function discoverSolidTypeIndexRegistrationsFromWebId')
    expect(rootShimSource).toMatch(/^export \* from '.\/data\/vocab\/vocab-discovery'\n?$/)
  })

  it('keeps proposal status resource writes under data/proposal with a root compatibility shim', () => {
    expect(existsSync(proposalStatusResourcePath)).toBe(true)
    expect(existsSync(rootProposalStatusShimPath)).toBe(true)
    if (!existsSync(proposalStatusResourcePath) || !existsSync(rootProposalStatusShimPath)) return

    const proposalStatusResourceSource = readFileSync(proposalStatusResourcePath, 'utf8')
    const rootShimSource = readFileSync(rootProposalStatusShimPath, 'utf8')

    expect(proposalStatusResourceSource).toContain('export async function markFilesProposalResourceResolved')
    expect(proposalStatusResourceSource).toContain('readRawTextResource')
    expect(proposalStatusResourceSource).toContain('saveRawTextResource')
    expect(proposalStatusResourceSource).toContain("from '../../domain/proposal/proposal-status'")
    expect(rootShimSource).toMatch([
      "export * from './domain/proposal/proposal-status'",
      "export * from './data/proposal/proposal-status-resource'",
      '',
    ].join('\n'))
  })

  it('keeps Files proposal application workflow under data/proposal with a root compatibility shim', () => {
    expect(existsSync(proposalApplicationCollectionPath)).toBe(true)
    expect(existsSync(rootProposalApplicationCollectionShimPath)).toBe(true)
    if (!existsSync(proposalApplicationCollectionPath) || !existsSync(rootProposalApplicationCollectionShimPath)) return

    const proposalApplicationSource = readFileSync(proposalApplicationCollectionPath, 'utf8')
    const rootShimSource = readFileSync(rootProposalApplicationCollectionShimPath, 'utf8')

    expect(proposalApplicationSource).toContain('export const filesProposalApplicationCollection')
    expect(proposalApplicationSource).toContain("from './proposal-status-resource'")
    expect(proposalApplicationSource).toContain("from './vocab-approval-commands'")
    expect(proposalApplicationSource).toContain("from '../../domain/proposal/access-approval-model'")
    expect(proposalApplicationSource).toContain("from '../../domain/structured/structured-table'")
    expect(rootShimSource).toMatch(/^export \* from '.\/data\/proposal\/proposal-application-collection'\n?$/)
  })

  it('keeps access approval resource commands under data/proposal with a root compatibility shim', () => {
    expect(existsSync(accessApprovalCommandsPath)).toBe(true)
    expect(existsSync(rootAccessApprovalShimPath)).toBe(true)
    if (!existsSync(accessApprovalCommandsPath) || !existsSync(rootAccessApprovalShimPath)) return

    const accessApprovalCommandsSource = readFileSync(accessApprovalCommandsPath, 'utf8')
    const rootShimSource = readFileSync(rootAccessApprovalShimPath, 'utf8')

    expect(accessApprovalCommandsSource).toContain('export async function approveAccessPolicyProposalFromInbox')
    expect(accessApprovalCommandsSource).toContain('export async function createAccessPolicyProposalInboxApproval')
    expect(accessApprovalCommandsSource).toContain("from '../../domain/proposal/access-approval-model'")
    expect(accessApprovalCommandsSource).toContain("from '../pod-adapter'")
    expect(rootShimSource).toMatch([
      "export * from './domain/proposal/access-approval-model'",
      "export * from './data/proposal/access-approval-commands'",
      '',
    ].join('\n'))
  })

  it('keeps source approval resource commands under data/proposal with a root compatibility shim', () => {
    expect(existsSync(sourceApprovalCommandsPath)).toBe(true)
    expect(existsSync(rootSourceApprovalShimPath)).toBe(true)
    if (!existsSync(sourceApprovalCommandsPath) || !existsSync(rootSourceApprovalShimPath)) return

    const sourceApprovalCommandsSource = readFileSync(sourceApprovalCommandsPath, 'utf8')
    const rootShimSource = readFileSync(rootSourceApprovalShimPath, 'utf8')

    expect(sourceApprovalCommandsSource).toContain('export async function approveSourceUpdateProposalFromInbox')
    expect(sourceApprovalCommandsSource).toContain('export async function createSourceUpdateProposalInboxApproval')
    expect(sourceApprovalCommandsSource).toContain("from '../../domain/source/source-approval-model'")
    expect(sourceApprovalCommandsSource).toContain("from '../pod-adapter'")
    expect(rootShimSource).toMatch([
      "export * from './domain/source/source-approval-model'",
      "export * from './data/proposal/source-approval-commands'",
      '',
    ].join('\n'))
  })

  it('keeps AI change approval resource commands under data/proposal with a root compatibility shim', () => {
    expect(existsSync(aiChangeApprovalCommandsPath)).toBe(true)
    expect(existsSync(rootAiChangeApprovalShimPath)).toBe(true)
    if (!existsSync(aiChangeApprovalCommandsPath) || !existsSync(rootAiChangeApprovalShimPath)) return

    const aiChangeApprovalCommandsSource = readFileSync(aiChangeApprovalCommandsPath, 'utf8')
    const rootShimSource = readFileSync(rootAiChangeApprovalShimPath, 'utf8')

    expect(aiChangeApprovalCommandsSource).toContain('export async function approveAiChangeProposalFromInbox')
    expect(aiChangeApprovalCommandsSource).toContain('export async function createAiChangeProposalInboxApproval')
    expect(aiChangeApprovalCommandsSource).toContain("from '../../domain/proposal/ai-change-approval-model'")
    expect(aiChangeApprovalCommandsSource).toContain("from '../pod-adapter'")
    expect(rootShimSource).toMatch([
      "export * from './domain/proposal/ai-change-approval-model'",
      "export * from './data/proposal/ai-change-approval-commands'",
      '',
    ].join('\n'))
  })

  it('keeps structured cell approval resource commands under data/proposal with a root compatibility shim', () => {
    expect(existsSync(structuredCellApprovalCommandsPath)).toBe(true)
    expect(existsSync(rootStructuredCellApprovalShimPath)).toBe(true)
    if (!existsSync(structuredCellApprovalCommandsPath) || !existsSync(rootStructuredCellApprovalShimPath)) return

    const structuredCellApprovalCommandsSource = readFileSync(structuredCellApprovalCommandsPath, 'utf8')
    const rootShimSource = readFileSync(rootStructuredCellApprovalShimPath, 'utf8')

    expect(structuredCellApprovalCommandsSource).toContain('export async function approveStructuredCellChangeProposalFromInbox')
    expect(structuredCellApprovalCommandsSource).toContain('export async function createStructuredCellChangeProposalInboxApproval')
    expect(structuredCellApprovalCommandsSource).toContain("from '../../domain/proposal/structured-cell-approval-model'")
    expect(structuredCellApprovalCommandsSource).toContain("from '../pod-adapter'")
    expect(rootShimSource).toMatch([
      "export * from './domain/proposal/structured-cell-approval-model'",
      "export * from './data/proposal/structured-cell-approval-commands'",
      '',
    ].join('\n'))
  })

  it('keeps vocab approval resource commands under data/proposal with a root compatibility shim', () => {
    expect(existsSync(vocabApprovalCommandsPath)).toBe(true)
    expect(existsSync(rootVocabApprovalShimPath)).toBe(true)
    if (!existsSync(vocabApprovalCommandsPath) || !existsSync(rootVocabApprovalShimPath)) return

    const vocabApprovalCommandsSource = readFileSync(vocabApprovalCommandsPath, 'utf8')
    const rootShimSource = readFileSync(rootVocabApprovalShimPath, 'utf8')

    expect(vocabApprovalCommandsSource).toContain('export async function approveVocabTermProposalFromInbox')
    expect(vocabApprovalCommandsSource).toContain('export async function approveVocabTermProposalCanonical')
    expect(vocabApprovalCommandsSource).toContain('export async function createVocabTermProposalInboxApproval')
    expect(vocabApprovalCommandsSource).toContain("from '../../domain/structured/structured-table'")
    expect(vocabApprovalCommandsSource).toContain("from '../pod-adapter'")
    expect(rootShimSource).toContain("from './domain/structured/structured-table'")
    expect(rootShimSource).toContain("from './data/proposal/vocab-approval-commands'")
    expect(rootShimSource).not.toContain('SolidDatabase')
    expect(rootShimSource).not.toContain('readRawTextResource')
    expect(rootShimSource).not.toContain('createRawTextResource')
    expect(rootShimSource).not.toMatch(/\nfunction /)
    expect(rootShimSource).not.toMatch(/\nexport async function /)
  })
})
