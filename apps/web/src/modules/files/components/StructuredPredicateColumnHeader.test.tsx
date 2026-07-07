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
  it('delegates predicate and shape opens instead of calling window.open directly', () => {
    const windowOpen = vi.spyOn(window, 'open').mockImplementation(() => null)
    const onOpenPredicateDefinition = vi.fn()
    const onOpenPredicateShapeRule = vi.fn()
    const onCopyPredicate = vi.fn()
    const writeText = vi.fn()
    const originalClipboard = navigator.clipboard
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    })

    try {
      render(createElement(Header, {
        definition: {
          uri: 'https://pod.example/.vocab/terms.ttl#status',
          label: 'status',
          description: 'Task status.',
          status: 'active',
          valueType: 'enum',
          shape: 'status shape',
          shapeRules: [{
            uri: 'https://pod.example/.vocab/shapes.ttl#status-required',
            label: 'Required',
            classScope: 'https://schema.example/Task',
            constraint: 'minCount 1',
            status: 'active',
          }],
        },
        observedValues: ['"Draft"'],
        onDiscard: vi.fn(),
        predicate: 'https://pod.example/.vocab/terms.ttl#status',
        sortIcon: null,
        onCopyPredicate,
        onOpenPredicateDefinition,
        onOpenPredicateShapeRule,
      }))

      fireEvent.pointerDown(screen.getByRole('button', { name: 'Open definition for status' }))
      fireEvent.click(screen.getByRole('menuitem', { name: '打开 predicate URI' }))
      expect(onOpenPredicateDefinition).toHaveBeenCalledWith('https://pod.example/.vocab/terms.ttl#status')

      fireEvent.pointerDown(screen.getByRole('button', { name: 'Open definition for status' }))
      fireEvent.click(screen.getByRole('menuitem', { name: '打开规则 Required' }))
      expect(onOpenPredicateShapeRule).toHaveBeenCalledWith('https://pod.example/.vocab/shapes.ttl#status-required')

      fireEvent.pointerDown(screen.getByRole('button', { name: 'Open definition for status' }))
      fireEvent.click(screen.getByRole('menuitem', { name: '复制 predicate URI' }))
      expect(onCopyPredicate).toHaveBeenCalledWith('https://pod.example/.vocab/terms.ttl#status')
      expect(writeText).not.toHaveBeenCalled()
      expect(windowOpen).not.toHaveBeenCalled()
    } finally {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: originalClipboard,
      })
    }
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

    fireEvent.pointerDown(screen.getByRole('button', { name: '待确认 predicate status' }))
    fireEvent.click(screen.getByRole('menuitem', { name: '打开审批记录' }))

    expect(onOpenVocabTermProposal).toHaveBeenCalledWith(vocabProposal)
    expect(windowOpen).not.toHaveBeenCalled()
  })
})
