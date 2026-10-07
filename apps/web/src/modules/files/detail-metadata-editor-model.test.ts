import { describe, expect, it } from 'vitest'

import {
  buildDetailPendingMetaPredicateProposalMap,
  createDetailMetaPredicateEditorState,
  detailReviewStatusOptions,
  detailTagOptions,
  displayDetailIriCellValue,
  displayDetailLiteralCellValue,
  hydrateDetailMetaPredicateValues,
  iriDetailCellValue,
  latestDetailPendingProposal,
  literalDetailCellValue,
  projectDetailMetaPredicateEditorDraft,
  projectDetailMetaPredicateEditorHydration,
  projectDetailMetaPredicateEditorProposalStatus,
  shouldCreateDetailMetaPredicateProposal,
  sourceLinkedCardBodyUri,
  splitDetailTagValue,
  type DetailMetaPredicateKey,
  type DetailMetaPredicateProposalStatus,
  type DetailPendingMetaPredicateProposalMap,
  type DetailMetaPredicateValues,
} from './domain/detail/detail-metadata-editor-model'
import * as detailMetadataEditorModel from './domain/detail/detail-metadata-editor-model'
import type { StructuredCellChangeProposal } from './domain/proposal/structured-cell-approval-model'

type DetailMetaPredicateProposalStatusMap = Partial<Record<DetailMetaPredicateKey, DetailMetaPredicateProposalStatus>>

function proposal(
  patch: Partial<StructuredCellChangeProposal> & Pick<StructuredCellChangeProposal, 'predicate' | 'createdAt' | 'nextValues'>,
): StructuredCellChangeProposal {
  return {
    id: `${patch.predicate}-${patch.createdAt}`,
    kind: 'structured-cell-change-proposal',
    status: 'pending',
    operation: 'replace-values',
    proposalResourceUri: `https://pod.example/.data/proposals/cell/${patch.predicate}-${patch.createdAt}.ttl`,
    documentUri: 'https://pod.example/file.md.meta',
    subject: '#meta',
    predicate: patch.predicate,
    previousValues: [],
    nextValues: patch.nextValues,
    reason: '',
    createdAt: patch.createdAt,
    writesCanonicalResource: false,
    ...patch,
  }
}

describe('detail metadata editor model', () => {
  it('derives source-linked card body resources without React state', () => {
    expect(sourceLinkedCardBodyUri('https://pod.example/notes/page.card.ttl')).toBe('https://pod.example/notes/page.md')
    expect(sourceLinkedCardBodyUri('https://pod.example/notes/page.ttl')).toBe('https://pod.example/notes/page.ttl.body.md')
  })

  it('normalizes detail metadata editor values', () => {
    expect(splitDetailTagValue(' alpha, beta ,, gamma ')).toEqual(['alpha', 'beta', 'gamma'])
    expect(literalDetailCellValue('hello "world" \\ path')).toBe('"hello \\"world\\" \\\\ path"')
    expect(iriDetailCellValue(' https://pod.example/source ')).toEqual(['<https://pod.example/source>'])
    expect(iriDetailCellValue('   ')).toEqual([])
    expect(displayDetailLiteralCellValue('"Line\\nTwo"')).toBe('Line\nTwo')
    expect(displayDetailIriCellValue('<https://pod.example/source>')).toBe('https://pod.example/source')
  })

  it('selects the latest pending proposal and hydrates editable values', () => {
    const older = proposal({
      predicate: 'rdfs:label',
      createdAt: '2026-01-01T00:00:00.000Z',
      nextValues: [literalDetailCellValue('Older')],
    })
    const newer = proposal({
      predicate: 'rdfs:label',
      createdAt: '2026-01-02T00:00:00.000Z',
      nextValues: [literalDetailCellValue('Newer')],
    })
    const source = proposal({
      predicate: 'dcterms:source',
      createdAt: '2026-01-02T00:00:00.000Z',
      nextValues: iriDetailCellValue('https://pod.example/source'),
    })

    expect(latestDetailPendingProposal([newer, older], 'https://pod.example/file.md.meta', '#meta', 'rdfs:label')).toBe(newer)

    const pendingMap = buildDetailPendingMetaPredicateProposalMap({
      proposals: [older, newer, source],
      documentUri: 'https://pod.example/file.md.meta',
      subject: '#meta',
      relationPredicate: 'dcterms:source',
    })
    const hydrated = hydrateDetailMetaPredicateValues({
      pendingProposals: pendingMap,
      values: {
        title: 'Original',
        reviewStatus: '',
        tags: 'draft',
        relation: '',
      } satisfies DetailMetaPredicateValues,
    })

    expect(hydrated).toEqual({
      title: 'Newer',
      reviewStatus: '',
      tags: 'draft',
      relation: 'https://pod.example/source',
    })
  })

  it('keeps duplicate pending metadata commits from being recreated', () => {
    const hydratedProposal = proposal({
      predicate: 'udfs:tags',
      createdAt: '2026-01-02T00:00:00.000Z',
      nextValues: [literalDetailCellValue('draft')],
    })

    expect(shouldCreateDetailMetaPredicateProposal({
      mutationPending: true,
      previousValues: [],
      nextValues: [literalDetailCellValue('draft')],
    })).toBe(false)
    expect(shouldCreateDetailMetaPredicateProposal({
      mutationPending: false,
      previousValues: [literalDetailCellValue('draft')],
      nextValues: [literalDetailCellValue('draft')],
    })).toBe(false)
    expect(shouldCreateDetailMetaPredicateProposal({
      mutationPending: false,
      previousValues: [],
      nextValues: [literalDetailCellValue('draft')],
      hydratedProposal,
    })).toBe(false)
    expect(shouldCreateDetailMetaPredicateProposal({
      mutationPending: false,
      previousValues: [],
      nextValues: [literalDetailCellValue('ready')],
      hydratedProposal,
    })).toBe(true)
  })

  it('derives compact editor option lists', () => {
    expect(detailReviewStatusOptions('Reviewing')).toEqual(['Reviewing', 'Draft', 'Ready', 'Published'])
    expect(detailReviewStatusOptions('Ready')).toEqual(['Draft', 'Ready', 'Published'])
    expect(detailTagOptions('alpha, beta', [literalDetailCellValue('beta'), literalDetailCellValue('gamma')])).toEqual(['alpha', 'beta', 'gamma'])
  })

  it('projects local meta predicate proposal status transitions without React state access', () => {
    const projectDetailMetaPredicateProposalStatuses = (
      detailMetadataEditorModel as typeof detailMetadataEditorModel & {
        projectDetailMetaPredicateProposalStatuses?: (input: {
          current: DetailMetaPredicateProposalStatusMap
          predicateKey: DetailMetaPredicateKey
          status?: DetailMetaPredicateProposalStatus
        }) => DetailMetaPredicateProposalStatusMap
      }
    ).projectDetailMetaPredicateProposalStatuses

    expect(projectDetailMetaPredicateProposalStatuses).toBeTypeOf('function')
    if (!projectDetailMetaPredicateProposalStatuses) return

    expect(projectDetailMetaPredicateProposalStatuses({
      current: { title: 'error', tags: 'pending' },
      predicateKey: 'title',
      status: undefined,
    })).toEqual({
      title: undefined,
      tags: 'pending',
    })
    expect(projectDetailMetaPredicateProposalStatuses({
      current: { title: undefined },
      predicateKey: 'title',
      status: 'pending',
    })).toEqual({
      title: 'pending',
    })
    expect(projectDetailMetaPredicateProposalStatuses({
      current: { title: 'pending' },
      predicateKey: 'title',
      status: 'error',
    })).toEqual({
      title: 'error',
    })
  })

  it('resolves local meta predicate status before hydrated pending proposal fallback', () => {
    const resolveDetailMetaPredicateProposalStatus = (
      detailMetadataEditorModel as typeof detailMetadataEditorModel & {
        resolveDetailMetaPredicateProposalStatus?: (input: {
          localStatuses: DetailMetaPredicateProposalStatusMap
          pendingProposals: DetailPendingMetaPredicateProposalMap
          predicateKey: DetailMetaPredicateKey
        }) => DetailMetaPredicateProposalStatus | undefined
      }
    ).resolveDetailMetaPredicateProposalStatus

    expect(resolveDetailMetaPredicateProposalStatus).toBeTypeOf('function')
    if (!resolveDetailMetaPredicateProposalStatus) return

    const titleProposal = proposal({
      predicate: 'rdfs:label',
      createdAt: '2026-01-02T00:00:00.000Z',
      nextValues: [literalDetailCellValue('Pending')],
    })

    expect(resolveDetailMetaPredicateProposalStatus({
      localStatuses: { title: 'error' },
      pendingProposals: { title: titleProposal },
      predicateKey: 'title',
    })).toBe('error')
    expect(resolveDetailMetaPredicateProposalStatus({
      localStatuses: {},
      pendingProposals: { title: titleProposal },
      predicateKey: 'title',
    })).toBe('pending')
    expect(resolveDetailMetaPredicateProposalStatus({
      localStatuses: {},
      pendingProposals: {},
      predicateKey: 'title',
    })).toBeUndefined()
  })

  it('projects detail meta predicate editor draft, hydration, and context reset state', () => {
    const initialHydratedValues = {
      title: 'Original title',
      reviewStatus: 'Draft',
      tags: 'alpha',
      relation: 'https://pod.example/source-a',
    } satisfies DetailMetaPredicateValues
    const initial = createDetailMetaPredicateEditorState({
      contextKey: 'https://pod.example/file.md.meta#meta',
      hydratedValues: initialHydratedValues,
    })

    expect(initial).toEqual({
      contextKey: 'https://pod.example/file.md.meta#meta',
      values: initialHydratedValues,
      hydratedValues: initialHydratedValues,
      proposalStatuses: {},
    })

    const locallyEdited = projectDetailMetaPredicateEditorProposalStatus({
      current: projectDetailMetaPredicateEditorDraft({
        current: initial,
        predicateKey: 'title',
        nextValues: [literalDetailCellValue('Local title')],
      }),
      predicateKey: 'title',
      status: 'pending',
    })
    const externallyHydrated = projectDetailMetaPredicateEditorHydration({
      current: locallyEdited,
      contextKey: 'https://pod.example/file.md.meta#meta',
      hydratedValues: {
        title: 'External title',
        reviewStatus: 'Ready',
        tags: 'beta',
        relation: 'https://pod.example/source-b',
      },
    })

    expect(externallyHydrated.values).toEqual({
      title: 'Local title',
      reviewStatus: 'Ready',
      tags: 'beta',
      relation: 'https://pod.example/source-b',
    })
    expect(externallyHydrated.hydratedValues).toEqual({
      title: 'Original title',
      reviewStatus: 'Ready',
      tags: 'beta',
      relation: 'https://pod.example/source-b',
    })

    expect(projectDetailMetaPredicateEditorDraft({
      current: externallyHydrated,
      predicateKey: 'tags',
      nextValues: [literalDetailCellValue('alpha'), literalDetailCellValue('gamma')],
    }).values.tags).toBe('alpha, gamma')
    expect(projectDetailMetaPredicateEditorDraft({
      current: externallyHydrated,
      predicateKey: 'relation',
      nextValues: iriDetailCellValue('https://pod.example/source-c'),
    }).values.relation).toBe('https://pod.example/source-c')

    const switchedContext = projectDetailMetaPredicateEditorHydration({
      current: externallyHydrated,
      contextKey: 'https://pod.example/other.md.meta#meta',
      hydratedValues: {
        title: 'Other title',
        reviewStatus: '',
        tags: '',
        relation: '',
      },
    })

    expect(switchedContext).toEqual({
      contextKey: 'https://pod.example/other.md.meta#meta',
      values: {
        title: 'Other title',
        reviewStatus: '',
        tags: '',
        relation: '',
      },
      hydratedValues: {
        title: 'Other title',
        reviewStatus: '',
        tags: '',
        relation: '',
      },
      proposalStatuses: {},
    })
  })
})
