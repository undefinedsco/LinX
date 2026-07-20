import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { FilesExplorerRow } from './FilesExplorerRow'

describe('FilesExplorerRow', () => {
  it('renders a compact accessible tree item with disclosure for folders', () => {
    const onToggle = vi.fn()
    const onSelect = vi.fn()
    const onOpen = vi.fn()

    render(
      <FilesExplorerRow
        uri="https://pod.example/public/docs/"
        name="docs"
        iconKind="folder"
        depth={1}
        expandable
        expanded={false}
        selected={false}
        metadataWarning={null}
        onToggle={onToggle}
        onSelect={onSelect}
        onOpen={onOpen}
        onKeyCommand={vi.fn()}
        renderContextMenu={() => null}
      />,
    )

    const row = screen.getByRole('treeitem', { name: 'docs' })
    expect(row).toHaveAttribute('aria-level', '2')
    expect(row).toHaveAttribute('aria-expanded', 'false')
    expect(row.className).toContain('h-7')
    expect(row).toHaveClass('w-full', 'max-w-full', 'overflow-hidden')

    fireEvent.click(screen.getByRole('button', { name: '展开 docs' }))
    expect(onToggle).toHaveBeenCalledTimes(1)
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('opens with Enter and selects with Space', () => {
    const onKeyCommand = vi.fn()
    const onSelect = vi.fn()
    const onOpen = vi.fn()

    render(
      <FilesExplorerRow
        uri="https://pod.example/public/docs/guide.md"
        name="guide.md"
        iconKind="document"
        depth={0}
        expandable={false}
        expanded={false}
        selected={false}
        metadataWarning={null}
        onToggle={vi.fn()}
        onSelect={onSelect}
        onOpen={onOpen}
        onKeyCommand={onKeyCommand}
        renderContextMenu={() => null}
      />,
    )

    const row = screen.getByRole('treeitem', { name: 'guide.md' })
    fireEvent.keyDown(row, { key: 'Enter' })
    fireEvent.keyDown(row, { key: ' ' })

    expect(onOpen).toHaveBeenCalledWith('enter')
    expect(onSelect).toHaveBeenCalledTimes(1)
  })

  it('keeps only the active row in the tab sequence', () => {
    const { rerender } = render(
      <FilesExplorerRow
        uri="https://pod.example/public/docs/guide.md"
        name="guide.md"
        iconKind="document"
        depth={0}
        expandable={false}
        expanded={false}
        selected={false}
        focusable={false}
        metadataWarning={null}
        onToggle={vi.fn()}
        onSelect={vi.fn()}
        onOpen={vi.fn()}
        onKeyCommand={vi.fn()}
        renderContextMenu={() => null}
      />,
    )

    const row = screen.getByRole('treeitem', { name: 'guide.md' })
    expect(row).toHaveAttribute('tabindex', '-1')

    rerender(
      <FilesExplorerRow
        uri="https://pod.example/public/docs/guide.md"
        name="guide.md"
        iconKind="document"
        depth={0}
        expandable={false}
        expanded={false}
        selected
        focusable
        metadataWarning={null}
        onToggle={vi.fn()}
        onSelect={vi.fn()}
        onOpen={vi.fn()}
        onKeyCommand={vi.fn()}
        renderContextMenu={() => null}
      />,
    )
    expect(screen.getByRole('treeitem', { name: 'guide.md' })).toHaveAttribute('tabindex', '0')
  })

  it('moves DOM focus with keyboard navigation instead of only changing selection', async () => {
    render(
      <>
        <FilesExplorerRow
          uri="https://pod.example/public/first.md"
          name="first.md"
          iconKind="document"
          depth={0}
          expandable={false}
          expanded={false}
          selected
          focusable
          metadataWarning={null}
          onToggle={vi.fn()}
          onSelect={vi.fn()}
          onOpen={vi.fn()}
          onKeyCommand={(key) => key === 'ArrowDown' ? 'https://pod.example/public/second.md' : null}
          renderContextMenu={() => null}
        />
        <FilesExplorerRow
          uri="https://pod.example/public/second.md"
          name="second.md"
          iconKind="document"
          depth={0}
          expandable={false}
          expanded={false}
          selected={false}
          focusable={false}
          metadataWarning={null}
          onToggle={vi.fn()}
          onSelect={vi.fn()}
          onOpen={vi.fn()}
          onKeyCommand={vi.fn()}
          renderContextMenu={() => null}
        />
      </>,
    )

    const firstRow = screen.getByRole('treeitem', { name: 'first.md' })
    const secondRow = screen.getByRole('treeitem', { name: 'second.md' })
    firstRow.focus()
    fireEvent.keyDown(firstRow, { key: 'ArrowDown' })

    await waitFor(() => expect(document.activeElement).toBe(secondRow))
  })

  it('reveals row actions on hover without selecting the resource', () => {
    const onSelect = vi.fn()
    const onToggleFavorite = vi.fn()

    render(
      <FilesExplorerRow
        uri="https://pod.example/public/docs/guide.md"
        name="guide.md"
        iconKind="document"
        depth={0}
        expandable={false}
        expanded={false}
        selected={false}
        favorite={false}
        metadataWarning={null}
        onToggle={vi.fn()}
        onSelect={onSelect}
        onOpen={vi.fn()}
        onToggleFavorite={onToggleFavorite}
        onKeyCommand={vi.fn()}
        renderContextMenu={() => null}
        renderActionsMenu={() => null}
      />,
    )

    const favorite = screen.getByRole('button', { name: '收藏 guide.md' })
    const more = screen.getByRole('button', { name: '更多 guide.md 操作' })
    expect(favorite.parentElement?.className).toContain('group-hover:opacity-100')
    expect(favorite.parentElement?.className).toContain('opacity-0')
    expect(favorite.parentElement?.className).toContain('absolute')
    expect(favorite.parentElement?.className).toContain('right-2')
    expect(more).toBeInTheDocument()

    fireEvent.click(favorite)
    expect(onToggleFavorite).toHaveBeenCalledTimes(1)
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('keeps an active favorite visible without hover', () => {
    render(
      <FilesExplorerRow
        uri="https://pod.example/public/docs/saved.md"
        name="saved.md"
        iconKind="document"
        depth={0}
        expandable={false}
        expanded={false}
        selected={false}
        favorite
        metadataWarning={null}
        onToggle={vi.fn()}
        onSelect={vi.fn()}
        onOpen={vi.fn()}
        onToggleFavorite={vi.fn()}
        onKeyCommand={vi.fn()}
        renderContextMenu={() => null}
        renderActionsMenu={() => null}
      />,
    )

    const favorite = screen.getByRole('button', { name: '取消收藏 saved.md' })
    expect(favorite.parentElement?.className).toContain('opacity-100')
    expect(favorite.querySelector('svg')).toHaveClass('fill-primary')
  })
})
