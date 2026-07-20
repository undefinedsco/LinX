import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { LinxWhiteboardToolbar } from './LinxWhiteboardToolbar'

const chrome = {
  toolsButtonAriaLabel: '白板工具',
  toolsButtonLabel: '白板工具',
  addSubjectButtonAriaLabel: '添加 subject 到白板',
  addSubjectButtonLabel: 'Subject',
  noAvailableSubjectOptionsLabel: '可见 subject 已全部加入白板',
  addRelationButtonAriaLabel: '添加视觉关系',
  addRelationButtonLabel: '关系',
  clearSubjectsButtonAriaLabel: '清空白板 subject',
  clearSubjectsButtonLabel: '清空',
  emptyCanvasMessage: '添加 subject 后会在白板中显示卡片。',
}

describe('LinxWhiteboardToolbar', () => {
  it('offers compact tools, search selection, quick add, relation creation, and zoom commands', () => {
    const onAddSubject = vi.fn()
    const onOpenRelationEditor = vi.fn()
    const onSearchSubject = vi.fn()
    const onZoomIn = vi.fn()
    const onZoomOut = vi.fn()
    const onResetZoom = vi.fn()
    const onSelectTool = vi.fn()
    const onHandTool = vi.fn()
    const onGroupSelection = vi.fn()
    const onClearSubjects = vi.fn()

    render(
      <LinxWhiteboardToolbar
        cardCountLabel="白板中 1 张卡片"
        chrome={chrome}
        availableRows={[
          { subject: '#a', cells: [] },
          { subject: '#beta', cells: [{ predicate: 'title', values: ['"Beta card"'] }] },
        ]}
        nodes={[
          {
            subject: '#a',
            title: 'Alpha',
            className: 'Card',
            summary: '',
            tags: [],
            x: 0,
            y: 0,
            openAriaLabel: '',
            removeAriaLabel: '',
          },
        ]}
        canCreateVisualRelation
        canClearSubjects
        onAddSubject={onAddSubject}
        onClearSubjects={onClearSubjects}
        onGroupSelection={onGroupSelection}
        onHandTool={onHandTool}
        onOpenRelationEditor={onOpenRelationEditor}
        onSearchSubject={onSearchSubject}
        onSelectTool={onSelectTool}
        onZoomIn={onZoomIn}
        onZoomOut={onZoomOut}
        onResetZoom={onResetZoom}
      />,
    )

    expect(screen.queryByText('白板中 1 张卡片')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '选择工具' }))
    fireEvent.click(screen.getByRole('button', { name: '平移工具' }))
    fireEvent.click(screen.getByRole('button', { name: '组合所选内容' }))
    expect(onSelectTool).toHaveBeenCalled()
    expect(onHandTool).toHaveBeenCalled()
    expect(onGroupSelection).toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: '搜索白板 subject' }))
    fireEvent.change(screen.getByRole('searchbox', { name: '搜索白板 subject' }), {
      target: { value: 'alp' },
    })
    fireEvent.click(screen.getByRole('button', { name: '定位 Alpha' }))
    expect(onSearchSubject).toHaveBeenCalledWith('#a')

    fireEvent.pointerDown(screen.getByRole('button', { name: '添加 subject 到白板' }))
    expect(screen.getByText('Beta card')).toBeVisible()
    expect(screen.getByText('#beta')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: '添加 Beta card' }))
    expect(onAddSubject).toHaveBeenCalledWith('#beta')

    fireEvent.click(screen.getByRole('button', { name: '添加视觉关系' }))
    expect(onOpenRelationEditor).toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: '放大白板' }))
    fireEvent.click(screen.getByRole('button', { name: '缩小白板' }))
    fireEvent.click(screen.getByRole('button', { name: '重置白板缩放' }))
    expect(onZoomIn).toHaveBeenCalled()
    expect(onZoomOut).toHaveBeenCalled()
    expect(onResetZoom).toHaveBeenCalled()

    expect(screen.queryByRole('button', { name: '清空白板 subject' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '更多白板操作' }))
    fireEvent.click(screen.getByRole('button', { name: '清空白板 subject' }))
    expect(onClearSubjects).toHaveBeenCalled()
  })

  it('searches existing subjects and creates a new subject without losing a failed draft', async () => {
    const onCreateSubject = vi.fn()
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true)

    render(
      <LinxWhiteboardToolbar
        cardCountLabel="空白板"
        chrome={chrome}
        availableRows={[]}
        nodes={[]}
        canCreateVisualRelation={false}
        canClearSubjects={false}
        onCreateSubject={onCreateSubject}
        onGroupSelection={vi.fn()}
        onHandTool={vi.fn()}
        onOpenRelationEditor={vi.fn()}
        onSearchSubject={vi.fn()}
        onSelectTool={vi.fn()}
        onZoomIn={vi.fn()}
        onZoomOut={vi.fn()}
        onResetZoom={vi.fn()}
      />,
    )

    fireEvent.pointerDown(screen.getByRole('button', { name: '添加 subject 到白板' }))
    const input = screen.getByRole('textbox', { name: '搜索或新建 Subject' })
    fireEvent.change(input, { target: { value: '#first' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(await screen.findByText('创建失败，请重试')).toBeVisible()
    expect(input).toHaveValue('#first')

    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() => expect(onCreateSubject).toHaveBeenCalledTimes(2))
    expect(screen.queryByRole('textbox', { name: '搜索或新建 Subject' })).not.toBeInTheDocument()
  })
})
