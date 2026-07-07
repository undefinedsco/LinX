import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { StructuredPredicateActiveCell } from './StructuredPredicateActiveCell'

describe('StructuredPredicateActiveCell', () => {
  it('delegates enum option definition opens instead of calling window.open directly', () => {
    const windowOpen = vi.spyOn(window, 'open').mockImplementation(() => null)
    const onOpenEnumOptionDefinition = vi.fn()
    const termUri = 'https://pod.example/.vocab/terms.ttl#solid-modeling'

    render(
      <StructuredPredicateActiveCell
        activeEnumCell={{ subject: '#Workspace', predicate: 'tags' }}
        activeRelationCell={null}
        activeTextCell={null}
        cellProposalButton={() => null}
        closeActiveCellPopover={vi.fn()}
        documentUri="https://pod.example/.data/workspaces/ws-1/state.ttl"
        enumSearch=""
        getEnumOptionsForPredicate={() => ['solid-modeling']}
        hasCellWriteProposal={false}
        predicate="tags"
        predicateLabel="tags"
        popoverPlacement={null}
        projection={{ rows: [] }}
        resolveEnumOptionTermUri={() => termUri}
        reviewableVocabProposals={[]}
        rowSubject="#Workspace"
        shapeWarningIndicator={null}
        tableRows={[{ subject: '#Workspace', cells: { tags: ['"core"'] } }]}
        updateActiveRelationCellValue={vi.fn()}
        updateActiveTextCellValue={vi.fn()}
        updateEnumSearch={vi.fn()}
        values={['"core"']}
        onAddEnumOption={vi.fn()}
        onCancelCellDraft={vi.fn()}
        onCommitRelationCell={vi.fn()}
        onCommitTextCell={vi.fn()}
        onOpenEnumOptionDefinition={onOpenEnumOptionDefinition}
        onOpenRelationValue={vi.fn()}
        onRemoveEnumOption={vi.fn()}
      />,
    )

    fireEvent.pointerDown(screen.getByRole('button', { name: '选项定义 solid-modeling' }))
    fireEvent.click(screen.getByRole('menuitem', { name: '打开选项链接' }))

    expect(onOpenEnumOptionDefinition).toHaveBeenCalledWith(termUri)
    expect(windowOpen).not.toHaveBeenCalled()
  })
})
