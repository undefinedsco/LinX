// Directly adapted from codex-rs/tui/src/bottom_pane/footer.rs.
// This keeps the single-line footer layout rules close to Codex while
// letting LinX provide its own left/right footer text.

export const FOOTER_INDENT_COLS = 2
const FOOTER_CONTEXT_GAP_COLS = 1

export type FooterMode = 'ComposerEmpty' | 'ComposerHasDraft'

export interface FooterLayout {
  left: string
  showContext: boolean
}

export interface FooterRenderProps {
  mode: FooterMode
  emptyHint: string
  draftHint: string
  context?: string
}

function safeSlice(text: string, width: number): string {
  if (width <= 0) {
    return ''
  }

  if (text.length <= width) {
    return text
  }

  if (width <= 3) {
    return text.slice(0, width)
  }

  return `${text.slice(0, width - 3)}...`
}

export function leftFits(width: number, leftWidth: number): boolean {
  const maxWidth = Math.max(0, width - FOOTER_INDENT_COLS)
  return leftWidth <= maxWidth
}

export function rightAlignedX(width: number, contentWidth: number): number | null {
  if (width <= 0 || contentWidth <= 0) {
    return null
  }

  const maxWidth = Math.max(0, width - FOOTER_INDENT_COLS)
  if (maxWidth === 0) {
    return null
  }

  if (contentWidth >= maxWidth) {
    return FOOTER_INDENT_COLS
  }

  return Math.max(FOOTER_INDENT_COLS, width - contentWidth - FOOTER_INDENT_COLS)
}

export function canShowLeftWithContext(width: number, leftWidth: number, contextWidth: number): boolean {
  const contextX = rightAlignedX(width, contextWidth)
  if (contextX === null || leftWidth === 0) {
    return true
  }

  const leftExtent = FOOTER_INDENT_COLS + leftWidth + FOOTER_CONTEXT_GAP_COLS
  return leftExtent <= contextX
}

export function singleLineFooterLayout(width: number, left: string, context?: string): FooterLayout {
  const safeLeft = left.trim()
  const safeContext = context?.trim() ?? ''
  const leftWidth = safeLeft.length
  const contextWidth = safeContext.length

  if (!safeContext) {
    return { left: safeSlice(safeLeft, Math.max(0, width - FOOTER_INDENT_COLS)), showContext: false }
  }

  if (leftWidth > 0 && canShowLeftWithContext(width, leftWidth, contextWidth)) {
    return { left: safeLeft, showContext: true }
  }

  if (leftWidth > 0 && leftFits(width, leftWidth)) {
    return { left: safeLeft, showContext: false }
  }

  return { left: '', showContext: true }
}

export function renderFooterLine(props: FooterRenderProps, width: number): string {
  const leftText = props.mode === 'ComposerHasDraft' ? props.draftHint : props.emptyHint
  const layout = singleLineFooterLayout(width, leftText, props.context)
  const cells = Array.from({ length: Math.max(0, width) }, () => ' ')

  if (layout.left) {
    const clippedLeft = safeSlice(layout.left, Math.max(0, width - FOOTER_INDENT_COLS))
    for (const [index, char] of [...clippedLeft].entries()) {
      const target = FOOTER_INDENT_COLS + index
      if (target >= width) {
        break
      }
      cells[target] = char
    }
  }

  if (layout.showContext && props.context) {
    const context = safeSlice(props.context, Math.max(0, width - FOOTER_INDENT_COLS))
    const start = rightAlignedX(width, context.length)
    if (start !== null) {
      for (const [index, char] of [...context].entries()) {
        const target = start + index
        if (target >= width) {
          break
        }
        cells[target] = char
      }
    }
  }

  return cells.join('')
}
