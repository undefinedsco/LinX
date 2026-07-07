import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const collectionsPath = 'src/modules/files/data/collections/index.ts'
const proposalCollectionsPath = 'src/modules/files/data/collections/proposal-collections.ts'
const sourceIngestCollectionPath = 'src/modules/files/data/collections/source-ingest-collection.ts'
const sourceIngestUseCasesPath = 'src/modules/files/data/ingest/source-ingest-use-cases.ts'
const rootSourceIngestUseCasesShimPath = 'src/modules/files/source-ingest-use-cases.ts'
const sourceUpdateProposalUseCasesPath = 'src/modules/files/data/proposal/source-update-proposal-use-cases.ts'
const rootSourceUpdateProposalUseCasesShimPath = 'src/modules/files/source-update-proposal-use-cases.ts'
const structuredCellProposalUseCasesPath = 'src/modules/files/data/proposal/structured-cell-proposal-use-cases.ts'
const rootStructuredCellProposalUseCasesShimPath = 'src/modules/files/structured-cell-proposal-use-cases.ts'
const accessPolicyProposalUseCasesPath = 'src/modules/files/data/proposal/access-policy-proposal-use-cases.ts'
const rootAccessPolicyProposalUseCasesShimPath = 'src/modules/files/access-policy-proposal-use-cases.ts'
const aiChangeProposalUseCasesPath = 'src/modules/files/data/proposal/ai-change-proposal-use-cases.ts'
const rootAiChangeProposalUseCasesShimPath = 'src/modules/files/ai-change-proposal-use-cases.ts'
const vocabTermProposalUseCasesPath = 'src/modules/files/data/proposal/vocab-term-proposal-use-cases.ts'
const rootVocabTermProposalUseCasesShimPath = 'src/modules/files/vocab-term-proposal-use-cases.ts'
const proposalQueryUseCasesPath = 'src/modules/files/data/proposal/proposal-query-use-cases.ts'
const rootProposalQueryUseCasesShimPath = 'src/modules/files/proposal-query-use-cases.ts'

describe('Files collection architecture boundary', () => {
  it('keeps source ingest business workflow in a collection owner and out of the cache adapter', () => {
    const collectionsSource = readFileSync(collectionsPath, 'utf8')

    expect(existsSync(sourceIngestCollectionPath)).toBe(true)
    expect(existsSync(sourceIngestUseCasesPath)).toBe(true)
    expect(existsSync(rootSourceIngestUseCasesShimPath)).toBe(true)
    if (
      !existsSync(sourceIngestCollectionPath)
      || !existsSync(sourceIngestUseCasesPath)
      || !existsSync(rootSourceIngestUseCasesShimPath)
    ) return

    const sourceIngestCollectionSource = readFileSync(sourceIngestCollectionPath, 'utf8')
    const useCaseSource = readFileSync(sourceIngestUseCasesPath, 'utf8')
    const rootShimSource = readFileSync(rootSourceIngestUseCasesShimPath, 'utf8')

    expect(collectionsSource).toContain("from './source-ingest-collection'")
    expect(collectionsSource).not.toContain("from '../ingest/source-ingest-use-cases'")
    expect(collectionsSource).not.toContain("from '../../source-ingest-use-cases'")
    expect(sourceIngestCollectionSource).toContain('export function createSourceIngestCollection')
    expect(sourceIngestCollectionSource).toContain("from '../ingest/source-ingest-use-cases'")
    expect(sourceIngestCollectionSource).not.toContain("from '../collections'")
    expect(sourceIngestCollectionSource).not.toContain("from '../../source-ingest-use-cases'")
    expect(sourceIngestCollectionSource).toContain('sourceIngestUseCases')
    expect(sourceIngestCollectionSource).not.toContain('createSourceIngestSnapshot')
    expect(sourceIngestCollectionSource).not.toContain('renderSourceLinkedCardTurtle')
    expect(sourceIngestCollectionSource).not.toContain('ensureSourceIngestManifestResource')
    expect(sourceIngestCollectionSource).not.toContain('markSourceIngestRangeIngestedResource')

    expect(useCaseSource).toContain('export const sourceIngestUseCases')
    expect(useCaseSource).not.toContain('@tanstack/react-query')
    expect(useCaseSource).not.toContain('@/providers/query-provider')
    expect(useCaseSource).not.toContain('QueryClient')
    expect(useCaseSource).not.toContain('invalidateQueries')
    expect(rootShimSource).toMatch(/^export \* from '.\/data\/ingest\/source-ingest-use-cases'\n?$/)
  })

  it('keeps source update proposal writes out of the collection cache adapter', () => {
    const collectionsSource = readFileSync(collectionsPath, 'utf8')

    expect(existsSync(proposalCollectionsPath)).toBe(true)
    expect(existsSync(sourceUpdateProposalUseCasesPath)).toBe(true)
    expect(existsSync(rootSourceUpdateProposalUseCasesShimPath)).toBe(true)
    if (
      !existsSync(proposalCollectionsPath)
      || !existsSync(sourceUpdateProposalUseCasesPath)
      || !existsSync(rootSourceUpdateProposalUseCasesShimPath)
    ) return

    const proposalCollectionsSource = readFileSync(proposalCollectionsPath, 'utf8')
    const useCaseSource = readFileSync(sourceUpdateProposalUseCasesPath, 'utf8')
    const rootShimSource = readFileSync(rootSourceUpdateProposalUseCasesShimPath, 'utf8')
    const sourceUpdateCollectionBlock =
      proposalCollectionsSource.match(/const sourceUpdateProposalCollection = \{[\s\S]*?\n  \}\n\n  const aiChangeProposalCollection/)?.[0] ?? ''

    expect(collectionsSource).toContain("from './proposal-collections'")
    expect(collectionsSource).not.toContain("from '../proposal/source-update-proposal-use-cases'")
    expect(collectionsSource).not.toContain("from '../../source-update-proposal-use-cases'")
    expect(proposalCollectionsSource).toContain("from '../proposal/source-update-proposal-use-cases'")
    expect(proposalCollectionsSource).not.toContain("from '../../source-update-proposal-use-cases'")
    expect(sourceUpdateCollectionBlock).toContain('sourceUpdateProposalUseCases')
    expect(sourceUpdateCollectionBlock).not.toContain('createSourceIngestManifest')
    expect(sourceUpdateCollectionBlock).not.toContain('ensureSourceIngestManifestResource')
    expect(sourceUpdateCollectionBlock).not.toContain('createRawTextResource')
    expect(sourceUpdateCollectionBlock).not.toContain('renderSourceUpdateProposalTurtle')
    expect(sourceUpdateCollectionBlock).not.toContain('createSourceUpdateProposalInboxApproval')

    expect(useCaseSource).toContain('export const sourceUpdateProposalUseCases')
    expect(useCaseSource).not.toContain('@tanstack/react-query')
    expect(useCaseSource).not.toContain('@/providers/query-provider')
    expect(useCaseSource).not.toContain('QueryClient')
    expect(useCaseSource).not.toContain('invalidateQueries')
    expect(rootShimSource).toMatch(/^export \* from '.\/data\/proposal\/source-update-proposal-use-cases'\n?$/)
  })

  it('keeps simple proposal resource writes out of the collection cache adapter', () => {
    const collectionsSource = readFileSync(collectionsPath, 'utf8')

    expect(existsSync(proposalCollectionsPath)).toBe(true)
    expect(existsSync(structuredCellProposalUseCasesPath)).toBe(true)
    expect(existsSync(rootStructuredCellProposalUseCasesShimPath)).toBe(true)
    expect(existsSync(accessPolicyProposalUseCasesPath)).toBe(true)
    expect(existsSync(rootAccessPolicyProposalUseCasesShimPath)).toBe(true)
    expect(existsSync(aiChangeProposalUseCasesPath)).toBe(true)
    expect(existsSync(rootAiChangeProposalUseCasesShimPath)).toBe(true)
    if (
      !existsSync(structuredCellProposalUseCasesPath)
      || !existsSync(proposalCollectionsPath)
      || !existsSync(rootStructuredCellProposalUseCasesShimPath)
      || !existsSync(accessPolicyProposalUseCasesPath)
      || !existsSync(rootAccessPolicyProposalUseCasesShimPath)
      || !existsSync(aiChangeProposalUseCasesPath)
      || !existsSync(rootAiChangeProposalUseCasesShimPath)
    ) return

    const proposalCollectionsSource = readFileSync(proposalCollectionsPath, 'utf8')
    const structuredCellUseCaseSource = readFileSync(structuredCellProposalUseCasesPath, 'utf8')
    const structuredCellRootShimSource = readFileSync(rootStructuredCellProposalUseCasesShimPath, 'utf8')
    const accessPolicyUseCaseSource = readFileSync(accessPolicyProposalUseCasesPath, 'utf8')
    const accessPolicyRootShimSource = readFileSync(rootAccessPolicyProposalUseCasesShimPath, 'utf8')
    const aiChangeUseCaseSource = readFileSync(aiChangeProposalUseCasesPath, 'utf8')
    const aiChangeRootShimSource = readFileSync(rootAiChangeProposalUseCasesShimPath, 'utf8')
    const structuredCellCollectionBlock =
      proposalCollectionsSource.match(/const structuredCellProposalCollection = \{[\s\S]*?\n  \}\n\n  const structuredCellProposalCacheCollection/)?.[0] ?? ''
    const accessPolicyCollectionBlock =
      proposalCollectionsSource.match(/const accessPolicyProposalCollection = \{[\s\S]*?\n  \}\n\n  const sourceUpdateProposalCollection/)?.[0] ?? ''
    const aiChangeCollectionBlock =
      proposalCollectionsSource.match(/const aiChangeProposalCollection = \{[\s\S]*?\n  \}\n\n  const filesProposalQueryCollection/)?.[0] ?? ''

    expect(collectionsSource).toContain("from './proposal-collections'")
    expect(collectionsSource).not.toContain("from '../proposal/structured-cell-proposal-use-cases'")
    expect(collectionsSource).not.toContain("from '../proposal/access-policy-proposal-use-cases'")
    expect(collectionsSource).not.toContain("from '../proposal/ai-change-proposal-use-cases'")
    expect(collectionsSource).not.toContain("from '../../structured-cell-proposal-use-cases'")
    expect(collectionsSource).not.toContain("from '../../access-policy-proposal-use-cases'")
    expect(collectionsSource).not.toContain("from '../../ai-change-proposal-use-cases'")
    expect(proposalCollectionsSource).toContain("from '../proposal/structured-cell-proposal-use-cases'")
    expect(proposalCollectionsSource).toContain("from '../proposal/access-policy-proposal-use-cases'")
    expect(proposalCollectionsSource).toContain("from '../proposal/ai-change-proposal-use-cases'")
    expect(proposalCollectionsSource).not.toContain("from '../../structured-cell-proposal-use-cases'")
    expect(proposalCollectionsSource).not.toContain("from '../../access-policy-proposal-use-cases'")
    expect(proposalCollectionsSource).not.toContain("from '../../ai-change-proposal-use-cases'")

    expect(structuredCellCollectionBlock).toContain('structuredCellProposalUseCases')
    expect(structuredCellCollectionBlock).not.toContain('createRawTextResource')
    expect(structuredCellCollectionBlock).not.toContain('renderStructuredCellChangeProposalTurtle')
    expect(structuredCellCollectionBlock).not.toContain('createStructuredCellChangeProposalInboxApproval')

    expect(accessPolicyCollectionBlock).toContain('accessPolicyProposalUseCases')
    expect(accessPolicyCollectionBlock).not.toContain('createRawTextResource')
    expect(accessPolicyCollectionBlock).not.toContain('renderAccessPolicyProposalTurtle')
    expect(accessPolicyCollectionBlock).not.toContain('createAccessPolicyProposalInboxApproval')

    expect(aiChangeCollectionBlock).toContain('aiChangeProposalUseCases')
    expect(aiChangeCollectionBlock).not.toContain('createRawTextResource')
    expect(aiChangeCollectionBlock).not.toContain('renderAiChangeProposalTurtle')
    expect(aiChangeCollectionBlock).not.toContain('createAiChangeProposalInboxApproval')

    for (const useCaseSource of [
      structuredCellUseCaseSource,
      accessPolicyUseCaseSource,
      aiChangeUseCaseSource,
    ]) {
      expect(useCaseSource).not.toContain('@tanstack/react-query')
      expect(useCaseSource).not.toContain('@/providers/query-provider')
      expect(useCaseSource).not.toContain('QueryClient')
      expect(useCaseSource).not.toContain('invalidateQueries')
    }
    expect(structuredCellRootShimSource).toMatch(/^export \* from '.\/data\/proposal\/structured-cell-proposal-use-cases'\n?$/)
    expect(accessPolicyRootShimSource).toMatch(/^export \* from '.\/data\/proposal\/access-policy-proposal-use-cases'\n?$/)
    expect(aiChangeRootShimSource).toMatch(/^export \* from '.\/data\/proposal\/ai-change-proposal-use-cases'\n?$/)
  })

  it('keeps vocab proposal writes and approval out of the collection cache adapter', () => {
    const collectionsSource = readFileSync(collectionsPath, 'utf8')

    expect(existsSync(proposalCollectionsPath)).toBe(true)
    expect(existsSync(vocabTermProposalUseCasesPath)).toBe(true)
    expect(existsSync(rootVocabTermProposalUseCasesShimPath)).toBe(true)
    if (
      !existsSync(proposalCollectionsPath)
      || !existsSync(vocabTermProposalUseCasesPath)
      || !existsSync(rootVocabTermProposalUseCasesShimPath)
    ) return

    const proposalCollectionsSource = readFileSync(proposalCollectionsPath, 'utf8')
    const useCaseSource = readFileSync(vocabTermProposalUseCasesPath, 'utf8')
    const rootShimSource = readFileSync(rootVocabTermProposalUseCasesShimPath, 'utf8')
    const vocabCollectionBlock =
      proposalCollectionsSource.match(/const vocabTermProposalCollection = \{[\s\S]*?\n  \}\n\n  const accessPolicyProposalCollection/)?.[0] ?? ''

    expect(collectionsSource).toContain("from './proposal-collections'")
    expect(collectionsSource).not.toContain("from '../proposal/vocab-term-proposal-use-cases'")
    expect(collectionsSource).not.toContain("from '../../vocab-term-proposal-use-cases'")
    expect(proposalCollectionsSource).toContain("from '../proposal/vocab-term-proposal-use-cases'")
    expect(proposalCollectionsSource).not.toContain("from '../../vocab-term-proposal-use-cases'")
    expect(vocabCollectionBlock).toContain('vocabTermProposalUseCases')
    expect(vocabCollectionBlock).not.toContain('createRawTextResource')
    expect(vocabCollectionBlock).not.toContain('renderVocabTermProposalTurtle')
    expect(vocabCollectionBlock).not.toContain('createVocabTermProposalInboxApproval')
    expect(vocabCollectionBlock).not.toContain('approveVocabTermProposalCanonical')
    expect(vocabCollectionBlock).not.toContain('readRawTextResource')

    expect(useCaseSource).toContain('export const vocabTermProposalUseCases')
    expect(useCaseSource).not.toContain('@tanstack/react-query')
    expect(useCaseSource).not.toContain('@/providers/query-provider')
    expect(useCaseSource).not.toContain('QueryClient')
    expect(useCaseSource).not.toContain('invalidateQueries')
    expect(rootShimSource).toMatch(/^export \* from '.\/data\/proposal\/vocab-term-proposal-use-cases'\n?$/)
  })

  it('keeps pending proposal target reads out of the collection cache adapter', () => {
    const collectionsSource = readFileSync(collectionsPath, 'utf8')

    expect(existsSync(proposalCollectionsPath)).toBe(true)
    expect(existsSync(proposalQueryUseCasesPath)).toBe(true)
    expect(existsSync(rootProposalQueryUseCasesShimPath)).toBe(true)
    if (
      !existsSync(proposalCollectionsPath)
      || !existsSync(proposalQueryUseCasesPath)
      || !existsSync(rootProposalQueryUseCasesShimPath)
    ) return

    const proposalCollectionsSource = readFileSync(proposalCollectionsPath, 'utf8')
    const useCaseSource = readFileSync(proposalQueryUseCasesPath, 'utf8')
    const rootShimSource = readFileSync(rootProposalQueryUseCasesShimPath, 'utf8')

    expect(collectionsSource).toContain("from './proposal-collections'")
    expect(collectionsSource).not.toContain("from '../proposal/proposal-query-use-cases'")
    expect(collectionsSource).not.toContain("from '../../proposal-query-use-cases'")
    expect(proposalCollectionsSource).toContain("from '../proposal/proposal-query-use-cases'")
    expect(proposalCollectionsSource).not.toContain("from '../../proposal-query-use-cases'")
    expect(collectionsSource).not.toContain('function stripResourceFragment')
    expect(collectionsSource).not.toContain('function readProposalFromTarget')
    expect(collectionsSource).not.toContain('function fetchPendingProposalTargets')
    expect(collectionsSource).not.toContain('function fetchPendingProposals')
    expect(collectionsSource).not.toContain('inboxOps.fetchApprovals')

    expect(useCaseSource).toContain('export const proposalQueryUseCases')
    expect(useCaseSource).not.toContain('@tanstack/react-query')
    expect(useCaseSource).not.toContain('@/providers/query-provider')
    expect(useCaseSource).not.toContain('QueryClient')
    expect(useCaseSource).not.toContain('invalidateQueries')
    expect(useCaseSource).not.toContain('@/modules/inbox/collections')
    expect(rootShimSource).toMatch(/^export \* from '.\/data\/proposal\/proposal-query-use-cases'\n?$/)
  })
})
