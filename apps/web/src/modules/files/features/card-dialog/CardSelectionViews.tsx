import { useCallback, useEffect, useRef, useState } from 'react'

import { findCardLocatorLines, type CardLocator } from '../../domain/card/card-dialog-model'

interface SelectionState {
  text: string
  left: number
  top: number
}

/** The passage selected inside `container`, with where to float the toolbar. */
export function useCardTextSelection(container: React.RefObject<HTMLElement | null>) {
  const [selection, setSelection] = useState<SelectionState | null>(null)

  const read = useCallback(() => {
    const root = container.current
    const current = typeof window !== 'undefined' ? window.getSelection() : null
    if (!root || !current || current.rangeCount === 0 || current.isCollapsed) {
      setSelection(null)
      return
    }
    const text = current.toString().trim()
    const range = current.getRangeAt(0)
    if (!text || !root.contains(range.commonAncestorContainer)) {
      setSelection(null)
      return
    }
    const rect = range.getBoundingClientRect()
    // Relative to the card body (the popup is a transformed element, so viewport coordinates
    // would land at its edge), and below the passage: the editor's own formatting bar sits above it.
    const origin = root.getBoundingClientRect()
    const half = 100
    setSelection({
      text,
      left: Math.min(Math.max(rect.left - origin.left + rect.width / 2, half), Math.max(half, origin.width - half)),
      top: rect.bottom - origin.top + 8,
    })
  }, [container])

  useEffect(() => {
    // Listen on the document: the card body mounts after the card loads, so a listener on
    // `container.current` taken at mount would never attach. `read` keeps only selections
    // inside the body.
    const clearWhenCollapsed = () => {
      const current = window.getSelection()
      if (!current || current.isCollapsed) setSelection(null)
    }
    document.addEventListener('mouseup', read)
    document.addEventListener('keyup', read)
    document.addEventListener('selectionchange', clearWhenCollapsed)
    return () => {
      document.removeEventListener('mouseup', read)
      document.removeEventListener('keyup', read)
      document.removeEventListener('selectionchange', clearWhenCollapsed)
    }
  }, [read])

  return { selection, clear: () => setSelection(null) }
}

/** 问 LinX · 做成卡片 · 复制链接 — floats just below the selected passage (K5). */
export function CardSelectionToolbar({
  selection,
  onAsk,
  onMakeCard,
  onCopyLink,
}: {
  selection: SelectionState | null
  onAsk: (quote: string) => void
  onMakeCard: (quote: string) => void
  onCopyLink: (quote: string) => void
}) {
  if (!selection) return null
  const items: Array<[string, (quote: string) => void]> = [
    ['问 LinX', onAsk],
    ['做成卡片', onMakeCard],
    ['复制链接', onCopyLink],
  ]
  return (
    <div
      role="toolbar"
      aria-label="选中的文字"
      data-card-selection-toolbar="true"
      className="absolute z-20 flex -translate-x-1/2 items-center gap-0.5 rounded-lg border border-border bg-popover p-1 text-sm text-popover-foreground shadow-lg ring-1 ring-black/5"
      style={{ left: selection.left, top: selection.top }}
      onMouseDown={(event) => event.preventDefault()}
    >
      {items.map(([label, handler]) => (
        <button
          key={label}
          type="button"
          className="rounded-md px-2.5 py-1.5 font-medium hover:bg-muted"
          onClick={() => handler(selection.text)}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

/** Plain text files: line numbers, jumped to the cited line with the passage lit up. */
export function CardTextViewer({ text, locator }: { text: string; locator?: CardLocator | null }) {
  const lines = text.split('\n')
  const range = findCardLocatorLines(text, locator)
  const firstCited = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    firstCited.current?.scrollIntoView?.({ block: 'center' })
  }, [range?.start, text])

  return (
    <div data-card-text-viewer="true" className="font-mono text-xs leading-6">
      {lines.map((line, index) => {
        const number = index + 1
        const cited = !!range && number >= range.start && number <= range.end
        return (
          <div
            key={number}
            ref={cited && number === range?.start ? firstCited : undefined}
            data-cited={cited ? 'true' : undefined}
            className={`flex gap-3 rounded px-1 ${cited ? 'bg-amber-100 text-amber-950' : ''}`}
          >
            <span className="w-8 shrink-0 select-none text-right text-muted-foreground">{number}</span>
            <span className="whitespace-pre-wrap break-words">{line || ' '}</span>
          </div>
        )
      })}
    </div>
  )
}
