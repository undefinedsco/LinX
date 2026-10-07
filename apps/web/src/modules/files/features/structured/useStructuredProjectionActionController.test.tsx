import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { copyFilesText, openFilesExternalUri } from '../../app/platform-actions'
import { useStructuredProjectionActionController } from './useStructuredProjectionActionController'

vi.mock('../../app/platform-actions', () => ({
  copyFilesText: vi.fn(() => Promise.resolve()),
  openFilesExternalUri: vi.fn(),
}))

const documentUri = 'https://pod.example/.data/workspaces/ws-1/state.ttl'

function vocabProposal({
  id,
  label,
  proposalResourceUri,
  termUri,
}: {
  id: string
  label: string
  proposalResourceUri: string
  termUri: string
}) {
  return {
    id,
    kind: 'vocab-term-proposal' as const,
    status: 'pending' as const,
    operation: 'create' as const,
    documentUri,
    proposalResourceUri,
    targetVocabUri: 'https://pod.example/.vocab/terms.ttl',
    targetShapesUri: 'https://pod.example/.vocab/shapes.ttl',
    classScope: null,
    termUri,
    termKind: 'predicate' as const,
    label,
    valueType: 'text',
    description: '',
    shape: '',
    createdAt: '2026-06-30T00:00:00.000Z',
    writesCanonicalVocab: false as const,
  }
}

describe('useStructuredProjectionActionController', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('keeps table action fallbacks and callback preference out of the projection renderer', () => {
    const onCopyPredicate = vi.fn()
    const onOpenEnumOptionDefinition = vi.fn()
    const onOpenPredicateDefinition = vi.fn()
    const onOpenPredicateShapeRule = vi.fn()
    const onOpenVocabTermProposal = vi.fn()
    const { result } = renderHook(() => useStructuredProjectionActionController({
      documentUri,
      onCopyPredicate,
      onOpenEnumOptionDefinition,
      onOpenPredicateDefinition,
      onOpenPredicateShapeRule,
      onOpenVocabTermProposal,
    }))

    result.current.openEnumOptionDefinition('https://pod.example/.vocab/status#Ready')
    result.current.openPredicateDefinition('https://pod.example/.vocab/predicate#status')
    result.current.openPredicateShapeRule('https://pod.example/.vocab/shapes#StatusShape')
    result.current.openVocabTermProposal(vocabProposal({
      id: 'proposal-1',
      termUri: 'https://pod.example/.vocab/predicate#status',
      label: 'Status',
      proposalResourceUri: 'https://pod.example/.data/proposals/status.ttl',
    }))
    result.current.copyPredicate('https://pod.example/.vocab/predicate#status')

    expect(onOpenEnumOptionDefinition).toHaveBeenCalledWith('https://pod.example/.vocab/status#Ready')
    expect(onOpenPredicateDefinition).toHaveBeenCalledWith('https://pod.example/.vocab/predicate#status')
    expect(onOpenPredicateShapeRule).toHaveBeenCalledWith('https://pod.example/.vocab/shapes#StatusShape')
    expect(onOpenVocabTermProposal).toHaveBeenCalledWith(expect.objectContaining({
      proposalResourceUri: 'https://pod.example/.data/proposals/status.ttl',
    }))
    expect(onCopyPredicate).toHaveBeenCalledWith('https://pod.example/.vocab/predicate#status')
    expect(openFilesExternalUri).not.toHaveBeenCalled()
    expect(copyFilesText).not.toHaveBeenCalled()
  })

  it('routes relation values through subject navigation when the value belongs to the current Pod', () => {
    const onOpenSubjectResource = vi.fn()
    const { result } = renderHook(() => useStructuredProjectionActionController({
      documentUri,
      onOpenSubjectResource,
    }))

    result.current.openRelationValue('https://pod.example/public/report.md', false)

    expect(onOpenSubjectResource).toHaveBeenCalledWith(
      'https://pod.example/public/report.md',
      'https://pod.example/public/report.md',
      'resource',
    )
    expect(openFilesExternalUri).not.toHaveBeenCalled()
  })

  it('uses platform fallbacks for external relations and missing optional callbacks', () => {
    const { result } = renderHook(() => useStructuredProjectionActionController({ documentUri }))

    result.current.openPredicateDefinition('https://pod.example/.vocab/predicate#status')
    result.current.openVocabTermProposal(vocabProposal({
      id: 'proposal-2',
      termUri: 'https://pod.example/.vocab/predicate#title',
      label: 'Title',
      proposalResourceUri: 'https://pod.example/.data/proposals/title.ttl',
    }))
    result.current.openRelationValue('https://external.example/report', false)
    result.current.openRelationValue('https://pod.example/public/report.md', true)
    result.current.copyPredicate('https://pod.example/.vocab/predicate#title')

    expect(openFilesExternalUri).toHaveBeenCalledWith('https://pod.example/.vocab/predicate#status')
    expect(openFilesExternalUri).toHaveBeenCalledWith('https://pod.example/.data/proposals/title.ttl')
    expect(openFilesExternalUri).toHaveBeenCalledWith('https://external.example/report')
    expect(openFilesExternalUri).toHaveBeenCalledWith('https://pod.example/public/report.md')
    expect(copyFilesText).toHaveBeenCalledWith('https://pod.example/.vocab/predicate#title')
  })
})
