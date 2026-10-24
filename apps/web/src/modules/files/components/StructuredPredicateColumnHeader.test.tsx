import { createElement, type ComponentType } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { StructuredPredicateColumnHeader } from './StructuredPredicateColumnHeader'

const Header = StructuredPredicateColumnHeader as ComponentType<Record<string, unknown>>

const vocabProposal = {
  id: 'https://pod.example/.data/proposals/vocab/status.ttl#proposal',
  kind: 'vocab-term-proposal',
  status: 'pending',
  operation: 'create',
  documentUri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
  proposalResourceUri: 'https://pod.example/.data/proposals/vocab/status.ttl',
  targetVocabUri: 'https://pod.example/.vocab/terms.ttl',
  targetShapesUri: 'https://pod.example/.vocab/shapes.ttl',
  classScope: 'https://schema.example/Task',
  termUri: 'https://pod.example/.vocab/terms.ttl#status',
  termKind: 'predicate',
  label: 'status',
  valueType: 'enum',
  description: 'Task status.',
  shape: 'status shape',
  createdAt: '2026-06-29T00:00:00.000Z',
  writesCanonicalVocab: false,
} as const

describe('StructuredPredicateColumnHeader', () => {
  it('delegates 在词表里查看 instead of calling window.open directly', () => {
    const windowOpen = vi.spyOn(window, 'open').mockImplementation(() => null)
    const onOpenDefinition = vi.fn()

    render(createElement(Header, {
      actions: { filterValues: [], onFilterChange: vi.fn(), onOpenDefinition, onSort: vi.fn() },
      definition: {
        uri: 'https://pod.example/.vocab/terms.ttl#status',
        label: 'status',
        description: 'Task status.',
        status: 'active',
        valueType: 'enum',
        shape: 'status shape',
        shapeRules: [],
      },
      observedValues: ['"Draft"'],
      onDiscard: vi.fn(),
      predicate: 'https://pod.example/.vocab/terms.ttl#status',
      sortIcon: null,
    }))

    fireEvent.pointerDown(screen.getByRole('button', { name: 'status 列菜单' }))
    fireEvent.click(screen.getByRole('menuitem', { name: '在词表里查看' }))
    expect(onOpenDefinition).toHaveBeenCalledTimes(1)
    expect(windowOpen).not.toHaveBeenCalled()
  })

  it('delegates pending predicate proposal opens instead of calling window.open directly', () => {
    const windowOpen = vi.spyOn(window, 'open').mockImplementation(() => null)
    const onOpenVocabTermProposal = vi.fn()

    render(createElement(Header, {
      observedValues: [],
      onDiscard: vi.fn(),
      predicate: 'https://pod.example/.vocab/terms.ttl#status',
      proposal: {
        id: 'status-proposal',
        label: 'status',
        uri: 'https://pod.example/.data/proposals/vocab/status.ttl#proposal',
        predicateUri: 'https://pod.example/.vocab/terms.ttl#status',
        type: 'enum',
        description: 'Task status.',
        shape: 'status shape',
        enumOptions: [],
        status: 'approval-staged',
        vocabProposal,
      },
      sortIcon: null,
      onOpenVocabTermProposal,
    }))

    fireEvent.pointerDown(screen.getByRole('button', { name: '待确认字段 status' }))
    fireEvent.click(screen.getByRole('menuitem', { name: '打开审批记录' }))

    expect(onOpenVocabTermProposal).toHaveBeenCalledWith(vocabProposal)
    expect(windowOpen).not.toHaveBeenCalled()
  })
})
