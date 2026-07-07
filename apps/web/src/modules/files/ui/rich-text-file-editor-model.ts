export type RichTextEditorSaveStatus = 'saved' | 'dirty' | 'saving' | 'error'

export type RichTextEditorSaveState = {
  isDirty: boolean
  status: RichTextEditorSaveStatus
}

export type RichTextEditorLinkMenuState = {
  open: boolean
  href: string
}

export type RichTextEditorBlockCommandMenuState = {
  open: boolean
  activeIndex: number
}

export type RichTextEditorBlockMoveMenuState = {
  open: boolean
}

export type RichTextEditorDocumentNode = {
  type?: string
  text?: string
  attrs?: Record<string, unknown> | null
  marks?: { type?: string; attrs?: Record<string, unknown> | null }[]
  content?: RichTextEditorDocumentNode[]
}

export type RichTextEditorDocumentSummary = {
  title: string | null
  links: string[]
}

export function createRichTextEditorSaveState(): RichTextEditorSaveState {
  return {
    isDirty: false,
    status: 'saved',
  }
}

export function createRichTextEditorLinkMenuState(): RichTextEditorLinkMenuState {
  return {
    open: false,
    href: '',
  }
}

export function createRichTextEditorBlockCommandMenuState(): RichTextEditorBlockCommandMenuState {
  return {
    open: false,
    activeIndex: 0,
  }
}

export function createRichTextEditorBlockMoveMenuState(): RichTextEditorBlockMoveMenuState {
  return {
    open: false,
  }
}

export function projectRichTextEditorBlockCommandMenuOpened(): RichTextEditorBlockCommandMenuState {
  return {
    open: true,
    activeIndex: 0,
  }
}

export function projectRichTextEditorBlockCommandMenuClosed(
  current: RichTextEditorBlockCommandMenuState,
): RichTextEditorBlockCommandMenuState {
  return {
    ...current,
    open: false,
  }
}

export function projectRichTextEditorBlockCommandMenuMoved(
  current: RichTextEditorBlockCommandMenuState,
  offset: number,
  itemCount: number,
): RichTextEditorBlockCommandMenuState {
  if (itemCount <= 0) {
    return {
      ...current,
      activeIndex: 0,
    }
  }
  return {
    ...current,
    activeIndex: (current.activeIndex + offset + itemCount) % itemCount,
  }
}

export function projectRichTextEditorBlockCommandMenuActiveIndexSet(
  current: RichTextEditorBlockCommandMenuState,
  activeIndex: number,
  itemCount: number,
): RichTextEditorBlockCommandMenuState {
  if (itemCount <= 0) {
    return {
      ...current,
      activeIndex: 0,
    }
  }
  return {
    ...current,
    activeIndex: Math.min(Math.max(activeIndex, 0), itemCount - 1),
  }
}

export function projectRichTextEditorBlockMoveMenuToggled(
  current: RichTextEditorBlockMoveMenuState,
): RichTextEditorBlockMoveMenuState {
  return {
    open: !current.open,
  }
}

export function projectRichTextEditorBlockMoveMenuClosed(
  _current: RichTextEditorBlockMoveMenuState,
): RichTextEditorBlockMoveMenuState {
  return {
    open: false,
  }
}

export function projectRichTextEditorLinkMenuToggled(current: RichTextEditorLinkMenuState): RichTextEditorLinkMenuState {
  return {
    ...current,
    open: !current.open,
  }
}

export function projectRichTextEditorLinkMenuHrefPatch(
  current: RichTextEditorLinkMenuState,
  href: string,
): RichTextEditorLinkMenuState {
  return {
    ...current,
    href,
  }
}

export function projectRichTextEditorLinkMenuAfterApply(_current: RichTextEditorLinkMenuState): RichTextEditorLinkMenuState {
  return createRichTextEditorLinkMenuState()
}

export function projectRichTextEditorSaveStateAfterDirtyComparison(hasUnsavedChanges: boolean): RichTextEditorSaveState {
  return {
    isDirty: hasUnsavedChanges,
    status: hasUnsavedChanges ? 'dirty' : 'saved',
  }
}

export function projectRichTextEditorSaveStateBeforeSave(current: RichTextEditorSaveState): RichTextEditorSaveState {
  return {
    isDirty: current.isDirty,
    status: 'saving',
  }
}

export function projectRichTextEditorSaveStateAfterSaveSuccess(): RichTextEditorSaveState {
  return createRichTextEditorSaveState()
}

export function projectRichTextEditorSaveStateAfterSaveError(): RichTextEditorSaveState {
  return {
    isDirty: true,
    status: 'error',
  }
}

function collectRichTextEditorDocumentText(node: RichTextEditorDocumentNode): string {
  if (node.text) return node.text
  return (node.content ?? []).map(collectRichTextEditorDocumentText).join('')
}

function collectRichTextEditorDocumentLinks(node: RichTextEditorDocumentNode, links: Set<string>): void {
  for (const mark of node.marks ?? []) {
    if (mark.type !== 'link') continue
    const href = typeof mark.attrs?.href === 'string' ? mark.attrs.href.trim() : ''
    if (href) links.add(href)
  }
  for (const child of node.content ?? []) {
    collectRichTextEditorDocumentLinks(child, links)
  }
}

export function extractRichTextEditorDocumentSummary(
  doc: RichTextEditorDocumentNode,
): RichTextEditorDocumentSummary {
  let title: string | null = null
  const links = new Set<string>()
  const visit = (node: RichTextEditorDocumentNode) => {
    if (
      title === null &&
      node.type === 'heading' &&
      node.attrs?.level === 1
    ) {
      const candidate = collectRichTextEditorDocumentText(node).trim()
      if (candidate) title = candidate
    }
    collectRichTextEditorDocumentLinks(node, links)
    for (const child of node.content ?? []) {
      visit(child)
    }
  }
  visit(doc)
  return {
    title,
    links: Array.from(links),
  }
}

export function getRichTextEditorSaveStatusLabel(status: RichTextEditorSaveStatus): string {
  switch (status) {
    case 'saved':
      return '已保存'
    case 'saving':
      return '正在保存'
    case 'error':
      return '保存失败'
    case 'dirty':
      return '未保存'
  }
}
