import { useEffect, useMemo, useRef, useState } from 'react'
import type { FocusEvent, KeyboardEvent as ReactKeyboardEvent } from 'react'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import Image from '@tiptap/extension-image'
import { TableKit } from '@tiptap/extension-table'
import { AlertTriangle, Bold, CheckSquare, Code2, FileInput, GripVertical, Heading1, ImageIcon, Italic, Link2, List, ListOrdered, Plus, Quote, Redo2, Search, Sparkles, Table2, Undo2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  createRichTextEditorBlockCommandMenuState,
  createRichTextEditorBlockMoveMenuState,
  createRichTextEditorLinkMenuState,
  createRichTextEditorSaveState,
  extractRichTextEditorDocumentSummary,
  getRichTextEditorSaveStatusLabel,
  projectRichTextEditorBlockCommandMenuActiveIndexSet,
  projectRichTextEditorBlockCommandMenuClosed,
  projectRichTextEditorBlockCommandMenuMoved,
  projectRichTextEditorBlockCommandMenuOpened,
  projectRichTextEditorBlockMoveMenuClosed,
  projectRichTextEditorBlockMoveMenuToggled,
  projectRichTextEditorLinkMenuAfterApply,
  projectRichTextEditorLinkMenuHrefPatch,
  projectRichTextEditorLinkMenuToggled,
  projectRichTextEditorSaveStateAfterDirtyComparison,
  projectRichTextEditorSaveStateAfterSaveError,
  projectRichTextEditorSaveStateAfterSaveSuccess,
  projectRichTextEditorSaveStateBeforeSave,
  type RichTextEditorBlockCommandMenuState,
  type RichTextEditorDocumentNode,
  type RichTextEditorDocumentSummary,
  type RichTextEditorSaveStatus,
} from './rich-text-file-editor-model'
import {
  projectRichTextCommandSearch,
  type RichTextCommandId,
} from './rich-text-editor/command-catalog'

export { extractRichTextEditorDocumentSummary }
export type { RichTextEditorDocumentNode, RichTextEditorDocumentSummary }

export type RichTextEditorContent = {
  inputFormat: 'html' | 'markdownish'
  saveFormat: 'markdown' | 'plain-text'
  text?: string | null
}

export type RichTextEditorWarning = {
  title: string
  description: string
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function renderInlineMarkdown(value: string): string {
  const placeholders: string[] = []
  const stash = (html: string) => {
    const token = `\u0000${placeholders.length}\u0000`
    placeholders.push(html)
    return token
  }
  const source = escapeHtml(value)
    .replace(/`([^`]+)`/g, (_match, code: string) => stash(`<code>${code}</code>`))
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_match, text: string, href: string) => {
      const safeHref = href.replace(/&quot;/g, '%22')
      return stash(`<a href="${safeHref}">${text}</a>`)
    })
    .replace(/\*\*([^*]+)\*\*/g, (_match, text: string) => stash(`<strong>${text}</strong>`))
    .replace(/\*([^*\n]+)\*/g, (_match, text: string) => stash(`<em>${text}</em>`))

  return source.replace(/\u0000(\d+)\u0000/g, (_match, index: string) => placeholders[Number(index)] ?? '')
}

function escapeMarkdownLinkText(value: string): string {
  return value.replace(/([\\[\]])/g, '\\$1')
}

function escapeMarkdownLinkHref(value: string): string {
  return value.replace(/([\\)])/g, '\\$1')
}

function serializeInlineNode(node: RichTextEditorDocumentNode): string {
  if (node.type === 'hardBreak') return '\n'
  let text = node.text ?? (node.content ?? []).map(serializeInlineNode).join('')
  for (const mark of node.marks ?? []) {
    if (mark.type === 'link') {
      const href = typeof mark.attrs?.href === 'string' ? mark.attrs.href.trim() : ''
      if (href) text = `[${escapeMarkdownLinkText(text)}](${escapeMarkdownLinkHref(href)})`
      continue
    }
    if (mark.type === 'bold') text = `**${text}**`
    if (mark.type === 'italic') text = `*${text}*`
    if (mark.type === 'code') text = `\`${text}\``
  }
  return text
}

function serializeBlockNode(node: RichTextEditorDocumentNode): string {
  const children = node.content ?? []
  switch (node.type) {
    case 'doc':
      return children.map(serializeBlockNode).filter(Boolean).join('\n\n')
    case 'heading': {
      const level = typeof node.attrs?.level === 'number' ? Math.min(Math.max(node.attrs.level, 1), 6) : 1
      return `${'#'.repeat(level)} ${children.map(serializeInlineNode).join('')}`.trim()
    }
    case 'paragraph':
      return children.map(serializeInlineNode).join('')
    case 'bulletList':
      return children.map(serializeBlockNode).filter(Boolean).join('\n')
    case 'orderedList':
      return children
        .map((child, index) => {
          const content = (child.content ?? []).map(serializeBlockNode).filter(Boolean).join('\n').replace(/\n/g, '\n   ')
          return content ? `${index + 1}. ${content}` : `${index + 1}.`
        })
        .filter(Boolean)
        .join('\n')
    case 'listItem': {
      const content = children.map(serializeBlockNode).filter(Boolean).join('\n').replace(/\n/g, '\n  ')
      return content ? `- ${content}` : '-'
    }
    case 'taskList':
      return children.map(serializeBlockNode).filter(Boolean).join('\n')
    case 'taskItem': {
      const content = children.map(serializeBlockNode).filter(Boolean).join('\n').replace(/\n/g, '\n  ')
      return `- [${node.attrs?.checked ? 'x' : ' '}] ${content}`.trimEnd()
    }
    case 'table':
      return children.map(serializeBlockNode).filter(Boolean).join('\n')
    case 'tableRow':
      return `| ${children.map(serializeBlockNode).join(' | ')} |`
    case 'tableHeader':
    case 'tableCell':
      return children.map(serializeBlockNode).filter(Boolean).join(' ')
    case 'image': {
      const src = typeof node.attrs?.src === 'string' ? node.attrs.src : ''
      const alt = typeof node.attrs?.alt === 'string' ? node.attrs.alt : ''
      return src ? `![${escapeMarkdownLinkText(alt)}](${escapeMarkdownLinkHref(src)})` : ''
    }
    case 'blockquote':
      return children
        .map(serializeBlockNode)
        .filter(Boolean)
        .join('\n')
        .split('\n')
        .map((line) => `> ${line}`.trimEnd())
        .join('\n')
    case 'codeBlock':
      return `\`\`\`\n${children.map(serializeInlineNode).join('')}\n\`\`\``
    default:
      return children.map(serializeBlockNode).filter(Boolean).join('\n\n') || serializeInlineNode(node)
  }
}

export function serializeTiptapJsonToMarkdown(doc: RichTextEditorDocumentNode): string {
  return serializeBlockNode(doc).trim()
}

function markdownishTextToHtml(text: string): string {
  const blocks = text
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)

  if (blocks.length === 0) return '<p></p>'

  return blocks.map((block) => {
    const lines = block.split('\n')
    const heading = lines[0].match(/^(#{1,3})\s+(.+)$/)
    if (heading) {
      const level = heading[1].length
      const rest = lines.slice(1).join('\n').trim()
      return [
        `<h${level}>${renderInlineMarkdown(heading[2])}</h${level}>`,
        rest ? `<p>${renderInlineMarkdown(rest).replace(/\n/g, '<br>')}</p>` : '',
      ].join('')
    }

    if (lines[0].startsWith('```')) {
      const lastLine = lines[lines.length - 1]
      const codeLines = lines.slice(1, lastLine?.trim() === '```' ? -1 : undefined)
      return `<pre><code>${escapeHtml(codeLines.join('\n'))}</code></pre>`
    }

    if (lines.every((line) => /^>\s?/.test(line))) {
      const quote = lines.map((line) => line.replace(/^>\s?/, '')).join('\n')
      return `<blockquote><p>${renderInlineMarkdown(quote).replace(/\n/g, '<br>')}</p></blockquote>`
    }

    if (lines.every((line) => /^\d+\.\s+/.test(line))) {
      const items = lines
        .map((line) => line.replace(/^\d+\.\s+/, '').trim())
        .filter(Boolean)
        .map((line) => `<li><p>${renderInlineMarkdown(line)}</p></li>`)
        .join('')
      return `<ol>${items}</ol>`
    }

    if (block.startsWith('- ') || block.startsWith('* ')) {
      if (lines.every((line) => /^[-*]\s+\[[ xX]\]\s+/.test(line))) {
        const items = lines.map((line) => {
          const match = line.match(/^[-*]\s+\[([ xX])\]\s+(.+)$/)
          if (!match) return ''
          return `<li data-type="taskItem" data-checked="${match[1].toLowerCase() === 'x'}"><p>${renderInlineMarkdown(match[2])}</p></li>`
        }).join('')
        return `<ul data-type="taskList">${items}</ul>`
      }
      const items = block
        .split('\n')
        .map((line) => line.replace(/^[-*]\s+/, '').trim())
        .filter(Boolean)
        .map((line) => `<li><p>${renderInlineMarkdown(line)}</p></li>`)
        .join('')
      return `<ul>${items}</ul>`
    }

    const image = block.match(/^!\[([^\]]*)\]\(([^)]+)\)$/)
    if (image) return `<img src="${escapeHtml(image[2])}" alt="${escapeHtml(image[1])}">`

    return `<p>${renderInlineMarkdown(block).replace(/\n/g, '<br>')}</p>`
  }).join('')
}

function htmlContentForEditor(content: RichTextEditorContent): string {
  const text = content.text ?? ''
  if (content.inputFormat === 'html') return text || '<p></p>'
  return markdownishTextToHtml(text)
}

function savedTextForEditor(content: RichTextEditorContent): string {
  return content.text ?? ''
}

function sanitizePastedPlainText(value: string) {
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
}

function normalizeEditableLinkHref(value: string): string | null {
  const href = value.trim()
  if (!href) return null
  if (/^(https?:|mailto:)/i.test(href)) return href
  if (/^[/.#]/.test(href)) return href
  return null
}

function readBrowserSelectedText(): string {
  if (typeof window === 'undefined') return ''
  return window.getSelection()?.toString() ?? ''
}

function htmlToPastedPlainText(html: string) {
  if (typeof document === 'undefined') return ''
  const template = document.createElement('template')
  template.innerHTML = html
  template.content.querySelectorAll('script, style, iframe, object, embed, meta, link').forEach((node) => node.remove())
  return template.content.textContent ?? ''
}

function serializeEditorContent(content: RichTextEditorContent, editor: {
  getJSON: () => RichTextEditorDocumentNode
  getText: () => string
}) {
  return content.saveFormat === 'markdown'
    ? serializeTiptapJsonToMarkdown(editor.getJSON())
    : editor.getText()
}

type RichTextHistoryState = {
  canUndo: boolean
  canRedo: boolean
}

type TiptapEditorInstance = NonNullable<ReturnType<typeof useEditor>>

const EMPTY_HISTORY_STATE: RichTextHistoryState = {
  canUndo: false,
  canRedo: false,
}

function readRichTextHistoryState(editor: { can: () => { undo: () => boolean; redo: () => boolean } } | null): RichTextHistoryState {
  if (!editor) return EMPTY_HISTORY_STATE
  const commands = editor.can()
  return {
    canUndo: commands.undo(),
    canRedo: commands.redo(),
  }
}

export function shouldOpenSlashBlockMenu(view: {
  state: {
    selection: {
      $from: {
        parent: { textBetween: (from: number, to: number, blockSeparator?: string, leafText?: string) => string }
        parentOffset: number
      }
    }
  }
}) {
  const { $from } = view.state.selection
  const textBeforeCursor = $from.parent.textBetween(0, $from.parentOffset, undefined, '\ufffc')
  return textBeforeCursor.trim().length === 0
}

function getCurrentTopLevelBlockIndex(editor: TiptapEditorInstance): number {
  const selectionFrom = editor.state.selection.from
  let currentIndex = -1
  editor.state.doc.forEach((node, offset, index) => {
    if (currentIndex !== -1) return
    const start = offset + 1
    const end = start + node.nodeSize
    if (selectionFrom >= start && selectionFrom <= end) currentIndex = index
  })
  return currentIndex
}

function canMoveCurrentTopLevelBlock(editor: TiptapEditorInstance, direction: -1 | 1): boolean {
  const content = editor.getJSON().content ?? []
  const currentIndex = getCurrentTopLevelBlockIndex(editor)
  const targetIndex = currentIndex + direction
  return currentIndex >= 0 && targetIndex >= 0 && targetIndex < content.length
}

export function RichTextFileEditor({
  content,
  className,
  editable = false,
  warning = null,
  onSaveText,
  onDirtyChange,
  onSaveStatusChange,
  onSubmitProposal,
  proposalPending = false,
  proposalLabel = '审批',
}: {
  content: RichTextEditorContent
  className?: string
  editable?: boolean
  warning?: RichTextEditorWarning | null
  onSaveText?: (text: string) => void | Promise<void>
  onDirtyChange?: (isDirty: boolean) => void
  onSaveStatusChange?: (status: RichTextEditorSaveStatus) => void
  onSubmitProposal?: (text: string, documentSummary: RichTextEditorDocumentSummary) => void | Promise<void>
  proposalPending?: boolean
  proposalLabel?: string
}) {
  const dirtyRef = useRef(false)
  const blockMenuOpenRef = useRef(false)
  const blockMenuActiveIndexRef = useRef(0)
  const lastSavedTextRef = useRef<string | null>(null)
  const [blockMenuState, setBlockMenuState] = useState(createRichTextEditorBlockCommandMenuState)
  const [blockMoveMenuState, setBlockMoveMenuState] = useState(createRichTextEditorBlockMoveMenuState)
  const [linkMenuState, setLinkMenuState] = useState(createRichTextEditorLinkMenuState)
  const [saveState, setSaveState] = useState(createRichTextEditorSaveState)
  const [historyState, setHistoryState] = useState<RichTextHistoryState>(EMPTY_HISTORY_STATE)
  const [formattingToolbarVisible, setFormattingToolbarVisible] = useState(false)
  const [blockCommandQuery, setBlockCommandQuery] = useState('')
  const [embedDraft, setEmbedDraft] = useState<{ kind: 'image' | 'reference'; url: string; label: string } | null>(null)
  const commandProjection = projectRichTextCommandSearch(blockCommandQuery)
  const blockCommands = commandProjection.sections.flatMap((section) => section.commands)
  const blockMenuOpen = blockMenuState.open
  const blockMenuActiveIndex = blockMenuState.activeIndex
  const blockMoveMenuOpen = blockMoveMenuState.open
  const linkMenuOpen = linkMenuState.open
  const linkHref = linkMenuState.href
  const editorHtml = useMemo(() => htmlContentForEditor(content), [content])
  const savedText = useMemo(() => savedTextForEditor(content), [content])
  if (lastSavedTextRef.current === null) {
    lastSavedTextRef.current = savedText
  }
  useEffect(() => {
    lastSavedTextRef.current = savedText
    const nextSaveState = projectRichTextEditorSaveStateAfterSaveSuccess()
    dirtyRef.current = nextSaveState.isDirty
    setSaveState(nextSaveState)
  }, [savedText])

  useEffect(() => {
    onDirtyChange?.(saveState.isDirty)
  }, [onDirtyChange, saveState.isDirty])

  useEffect(() => {
    onSaveStatusChange?.(saveState.status)
  }, [onSaveStatusChange, saveState.status])

  const commitBlockCommandMenuState = (nextState: RichTextEditorBlockCommandMenuState) => {
    blockMenuOpenRef.current = nextState.open
    blockMenuActiveIndexRef.current = nextState.activeIndex
    setBlockMenuState(nextState)
  }

  const currentBlockCommandMenuState = (): RichTextEditorBlockCommandMenuState => ({
    open: blockMenuOpenRef.current,
    activeIndex: blockMenuActiveIndexRef.current,
  })

  const editor = useEditor({
    editable,
    immediatelyRender: false,
    extensions: [
      StarterKit,
      TaskList,
      TaskItem.configure({ nested: true }),
      TableKit.configure({ table: { resizable: true } }),
      Image.configure({ allowBase64: false, inline: false }),
    ],
    content: editorHtml,
    onUpdate: ({ editor }) => {
      updateDirtyStateFromEditor(editor)
      setHistoryState(readRichTextHistoryState(editor))
    },
    onTransaction: ({ editor }) => {
      setHistoryState((current) => {
        const next = readRichTextHistoryState(editor)
        return current.canUndo === next.canUndo && current.canRedo === next.canRedo ? current : next
      })
    },
    onSelectionUpdate: ({ editor }) => {
      setFormattingToolbarVisible(!editor.state.selection.empty)
    },
    editorProps: {
      handlePaste: (view, event) => {
        if (!editable) return false
        const html = event.clipboardData?.getData('text/html') ?? ''
        if (!html.trim()) return false
        const plainText = event.clipboardData?.getData('text/plain') || htmlToPastedPlainText(html)
        const safeText = sanitizePastedPlainText(plainText)
        event.preventDefault()
        if (!safeText) return true
        view.dispatch(view.state.tr.insertText(safeText))
        return true
      },
      handleKeyDown: (_view, event) => {
        if (!editable) return false
        if (event.key === 'Escape' && blockMenuOpenRef.current) {
          event.preventDefault()
          commitBlockCommandMenuState(projectRichTextEditorBlockCommandMenuClosed(currentBlockCommandMenuState()))
          return true
        }
        if (event.key === '/' && !event.metaKey && !event.ctrlKey && !event.altKey && shouldOpenSlashBlockMenu(_view)) {
          event.preventDefault()
          commitBlockCommandMenuState(projectRichTextEditorBlockCommandMenuOpened())
          return true
        }
        return false
      },
    },
  }, [editorHtml, editable])

  const updateDirtyStateFromEditor = (currentEditor: {
    getJSON: () => RichTextEditorDocumentNode
    getText: () => string
  }) => {
    const nextText = serializeEditorContent(content, currentEditor)
    const nextSaveState = projectRichTextEditorSaveStateAfterDirtyComparison(nextText !== lastSavedTextRef.current)
    dirtyRef.current = nextSaveState.isDirty
    setSaveState(nextSaveState)
  }

  const getSerializedText = () => {
    if (!editor) return ''
    return serializeEditorContent(content, editor)
  }

  const handleBlur = async (event: FocusEvent<HTMLDivElement>) => {
    const nextFocusTarget = event.relatedTarget instanceof Node ? event.relatedTarget : null
    if (!nextFocusTarget || !event.currentTarget.contains(nextFocusTarget)) {
      setFormattingToolbarVisible(false)
    }
    if (!editable || !onSaveText) return
    if (!dirtyRef.current || !editor) return
    const nextText = getSerializedText()
    if (nextText === lastSavedTextRef.current) {
      const nextSaveState = projectRichTextEditorSaveStateAfterSaveSuccess()
      dirtyRef.current = nextSaveState.isDirty
      setSaveState(nextSaveState)
      return
    }
    setSaveState((current) => projectRichTextEditorSaveStateBeforeSave(current))
    try {
      await onSaveText(nextText)
      lastSavedTextRef.current = nextText
      const nextSaveState = projectRichTextEditorSaveStateAfterSaveSuccess()
      dirtyRef.current = nextSaveState.isDirty
      setSaveState(nextSaveState)
    } catch (_error) {
      const nextSaveState = projectRichTextEditorSaveStateAfterSaveError()
      dirtyRef.current = nextSaveState.isDirty
      setSaveState(nextSaveState)
    }
  }

  const handleSubmitProposal = async () => {
    if (!editable || !onSubmitProposal || !dirtyRef.current || !editor || proposalPending) return
    const nextText = getSerializedText()
    await onSubmitProposal(nextText, extractRichTextEditorDocumentSummary(editor.getJSON()))
    lastSavedTextRef.current = nextText
    const nextSaveState = projectRichTextEditorSaveStateAfterSaveSuccess()
    dirtyRef.current = nextSaveState.isDirty
    setSaveState(nextSaveState)
  }

  const insertParagraphBlock = () => {
    if (!editable || !editor) return
    editor.chain().insertContent('<p></p>').run()
  }

  const undo = () => {
    if (!editable || !editor || !historyState.canUndo) return
    editor.commands.undo()
    updateDirtyStateFromEditor(editor)
    setHistoryState(readRichTextHistoryState(editor))
  }

  const redo = () => {
    if (!editable || !editor || !historyState.canRedo) return
    editor.commands.redo()
    updateDirtyStateFromEditor(editor)
    setHistoryState(readRichTextHistoryState(editor))
  }

  const selectBrowserTextInEditor = () => {
    if (!editor) return
    const selectedText = readBrowserSelectedText()
    if (!selectedText) return
    const textIndex = editor.getText().indexOf(selectedText)
    if (textIndex < 0) return
    editor.commands.setTextSelection({
      from: textIndex + 1,
      to: textIndex + selectedText.length + 1,
    })
  }

  const applyLink = () => {
    if (!editable || !editor) return
    const href = normalizeEditableLinkHref(linkHref)
    if (!href) return
    editor.chain().extendMarkRange('link').setLink({ href }).run()
    updateDirtyStateFromEditor(editor)
    setHistoryState(readRichTextHistoryState(editor))
    setLinkMenuState(projectRichTextEditorLinkMenuAfterApply)
  }

  const runBlockCommand = (command: RichTextCommandId) => {
    if (!editable || !editor) return
    if (command === 'image' || command === 'reference') {
      setEmbedDraft({ kind: command, url: '', label: '' })
      return
    }
    const chain = editor.chain()
    if (command === 'paragraph') {
      chain.insertContent('<p></p>').run()
    } else if (command === 'heading-1') {
      chain.toggleHeading({ level: 1 }).run()
    } else if (command === 'bullet-list') {
      chain.toggleBulletList().run()
    } else if (command === 'ordered-list') {
      chain.toggleOrderedList().run()
    } else if (command === 'task') {
      chain.insertContent({
        type: 'taskList',
        content: [{
          type: 'taskItem',
          attrs: { checked: false },
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Task' }] }],
        }],
      }).run()
    } else if (command === 'table') {
      chain.insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
    } else if (command === 'quote') {
      chain.toggleBlockquote().run()
    } else if (command === 'code-block') {
      chain.toggleCodeBlock().run()
    }
    setBlockCommandQuery('')
    commitBlockCommandMenuState(projectRichTextEditorBlockCommandMenuClosed(currentBlockCommandMenuState()))
  }

  const insertEmbed = () => {
    if (!editable || !editor || !embedDraft) return
    const url = normalizeEditableLinkHref(embedDraft.url)
    if (!url) return
    const label = embedDraft.label.trim() || (embedDraft.kind === 'image' ? '图片' : url)
    if (embedDraft.kind === 'image') {
      editor.chain().focus('end').insertContent([
        { type: 'image', attrs: { src: url, alt: label } },
        { type: 'paragraph' },
      ]).run()
    } else {
      editor.chain().focus('end').insertContent({
        type: 'paragraph',
        content: [
          { type: 'text', text: '@' },
          { type: 'text', text: label, marks: [{ type: 'link', attrs: { href: url } }] },
        ],
      }).run()
    }
    setEmbedDraft(null)
    setBlockCommandQuery('')
    commitBlockCommandMenuState(projectRichTextEditorBlockCommandMenuClosed(currentBlockCommandMenuState()))
  }

  const moveCurrentBlock = (direction: -1 | 1) => {
    if (!editable || !editor) return
    const currentDoc = editor.getJSON()
    const content = [...(currentDoc.content ?? [])]
    const currentIndex = getCurrentTopLevelBlockIndex(editor)
    const targetIndex = currentIndex + direction
    if (currentIndex < 0 || targetIndex < 0 || targetIndex >= content.length) {
      setBlockMoveMenuState(projectRichTextEditorBlockMoveMenuClosed)
      return
    }
    const currentBlock = content[currentIndex]
    const targetBlock = content[targetIndex]
    if (!currentBlock || !targetBlock) {
      setBlockMoveMenuState(projectRichTextEditorBlockMoveMenuClosed)
      return
    }
    content[currentIndex] = targetBlock
    content[targetIndex] = currentBlock
    editor.chain().focus().setContent({ ...currentDoc, content }).run()
    updateDirtyStateFromEditor(editor)
    setHistoryState(readRichTextHistoryState(editor))
    setBlockMoveMenuState(projectRichTextEditorBlockMoveMenuClosed)
  }

  const handleEditorShellKeyDownCapture = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape' && blockMoveMenuOpen) {
      event.preventDefault()
      event.stopPropagation()
      setBlockMoveMenuState(projectRichTextEditorBlockMoveMenuClosed)
      return
    }
    if (!editable || !blockMenuOpenRef.current) return
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      event.stopPropagation()
      const offset = event.key === 'ArrowDown' ? 1 : -1
      commitBlockCommandMenuState(projectRichTextEditorBlockCommandMenuMoved(
        currentBlockCommandMenuState(),
        offset,
        blockCommands.length,
      ))
      return
    }
    if (event.key === 'Enter') {
      event.preventDefault()
      event.stopPropagation()
      runBlockCommand(blockCommands[blockMenuActiveIndexRef.current]?.id ?? 'paragraph')
      return
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      commitBlockCommandMenuState(projectRichTextEditorBlockCommandMenuClosed(currentBlockCommandMenuState()))
    }
  }

  const canMoveBlockUp = editable && editor ? canMoveCurrentTopLevelBlock(editor, -1) : false
  const canMoveBlockDown = editable && editor ? canMoveCurrentTopLevelBlock(editor, 1) : false
  const formattingToolbar = editable && formattingToolbarVisible ? (
    <div
      role="toolbar"
      aria-label="富文本块工具"
      data-toolbar-density="compact"
      data-control-placement="byline"
      data-control-surface="byline-contextual"
      className="absolute left-7 top-0 z-10 flex min-h-7 w-fit max-w-[calc(100%-2rem)] flex-wrap items-center justify-start gap-0.5 rounded-md border border-border/40 bg-popover px-1 py-1 text-muted-foreground shadow-sm"
    >
      <button
        type="button"
        aria-label="一级标题"
        aria-pressed={!!editor?.isActive('heading', { level: 1 })}
        className={cn(
          'inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted/70 hover:text-foreground disabled:opacity-40',
          editor?.isActive('heading', { level: 1 }) && 'bg-primary/10 text-primary',
        )}
        disabled={!editor}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => editor?.chain().focus().toggleHeading({ level: 1 }).run()}
      >
        <Heading1 className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
      <button
        type="button"
        aria-label="加粗"
        aria-pressed={!!editor?.isActive('bold')}
        className={cn(
          'inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted/70 hover:text-foreground disabled:opacity-40',
          editor?.isActive('bold') && 'bg-primary/10 text-primary',
        )}
        disabled={!editor}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => editor?.chain().focus().toggleBold().run()}
      >
        <Bold className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
      <button
        type="button"
        aria-label="斜体"
        aria-pressed={!!editor?.isActive('italic')}
        className={cn(
          'inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted/70 hover:text-foreground disabled:opacity-40',
          editor?.isActive('italic') && 'bg-primary/10 text-primary',
        )}
        disabled={!editor}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => editor?.chain().focus().toggleItalic().run()}
      >
        <Italic className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
      <button
        type="button"
        aria-label="项目列表"
        aria-pressed={!!editor?.isActive('bulletList')}
        className={cn(
          'inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted/70 hover:text-foreground disabled:opacity-40',
          editor?.isActive('bulletList') && 'bg-primary/10 text-primary',
        )}
        disabled={!editor}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => editor?.chain().focus().toggleBulletList().run()}
      >
        <List className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
      <button
        type="button"
        aria-label="引用块"
        aria-pressed={!!editor?.isActive('blockquote')}
        className={cn(
          'inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted/70 hover:text-foreground disabled:opacity-40',
          editor?.isActive('blockquote') && 'bg-primary/10 text-primary',
        )}
        disabled={!editor}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => editor?.chain().focus().toggleBlockquote().run()}
      >
        <Quote className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
      <button
        type="button"
        aria-label="代码块"
        aria-pressed={!!editor?.isActive('codeBlock')}
        className={cn(
          'inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted/70 hover:text-foreground disabled:opacity-40',
          editor?.isActive('codeBlock') && 'bg-primary/10 text-primary',
        )}
        disabled={!editor}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => editor?.chain().focus().toggleCodeBlock().run()}
      >
        <Code2 className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
      <button
        type="button"
        aria-label="添加链接"
        aria-expanded={linkMenuOpen}
        className={cn(
          'inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted/70 hover:text-foreground disabled:opacity-40',
          editor?.isActive('link') && 'bg-primary/10 text-primary',
        )}
        disabled={!editor}
        onMouseDown={(event) => {
          event.preventDefault()
          selectBrowserTextInEditor()
        }}
        onClick={() => {
          selectBrowserTextInEditor()
          setLinkMenuState(projectRichTextEditorLinkMenuToggled)
        }}
      >
        <Link2 className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
      {linkMenuOpen ? (
        <form
          className="flex items-center gap-1 rounded-md border border-border/50 bg-popover px-1.5 py-1 text-xs shadow-sm"
          onSubmit={(event) => {
            event.preventDefault()
            applyLink()
          }}
        >
          <label className="sr-only" htmlFor="rich-text-link-href">链接地址</label>
          <input
            id="rich-text-link-href"
            className="h-6 w-48 rounded border border-border/60 bg-background px-2 text-xs outline-none focus:border-primary"
            placeholder="https://..."
            value={linkHref}
            onChange={(event) => {
              const nextHref = event.target.value
              setLinkMenuState((current) => projectRichTextEditorLinkMenuHrefPatch(current, nextHref))
            }}
          />
          <button
            type="submit"
            className="rounded px-2 py-1 text-xs text-foreground hover:bg-muted/70 disabled:text-muted-foreground/40"
            disabled={!normalizeEditableLinkHref(linkHref)}
          >
            应用链接
          </button>
        </form>
      ) : null}
      {onSubmitProposal ? (
        <>
          <span className="mx-1 h-4 w-px bg-border/50" aria-hidden="true" />
          <button
            type="button"
            aria-label={`提交 ${proposalLabel}`}
            title={`提交 ${proposalLabel}`}
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted/70 hover:text-foreground disabled:opacity-40"
            disabled={!editor || !saveState.isDirty || proposalPending}
            onMouseDown={(event) => event.preventDefault()}
            onClick={handleSubmitProposal}
          >
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </>
      ) : null}
    </div>
  ) : null

  const editorStatusControls = editable ? (
    <div
      role="toolbar"
      aria-label="编辑历史与保存状态"
      className="absolute right-0 top-0 z-10 flex items-center gap-0.5 rounded-md bg-background/90 px-1 py-0.5 text-muted-foreground opacity-40 transition-opacity group-hover/byline:opacity-100 focus-within:opacity-100"
    >
      <button type="button" aria-label="撤销" className="inline-flex h-6 w-6 items-center justify-center rounded hover:bg-muted/70 hover:text-foreground disabled:opacity-30" disabled={!editor || !historyState.canUndo} onMouseDown={(event) => event.preventDefault()} onClick={undo}>
        <Undo2 className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
      <button type="button" aria-label="重做" className="inline-flex h-6 w-6 items-center justify-center rounded hover:bg-muted/70 hover:text-foreground disabled:opacity-30" disabled={!editor || !historyState.canRedo} onMouseDown={(event) => event.preventDefault()} onClick={redo}>
        <Redo2 className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
      {onSaveText ? (
        <span className={cn('ml-0.5 px-1.5 py-0.5 text-[11px]', saveState.status === 'saved' && 'text-success', saveState.status === 'dirty' && 'text-warning', saveState.status === 'saving' && 'text-muted-foreground', saveState.status === 'error' && 'text-destructive')} aria-live="polite">
          {getRichTextEditorSaveStatusLabel(saveState.status)}
        </span>
      ) : null}
    </div>
  ) : null

  return (
    <div
      className={cn(
        'bg-background px-2 py-2',
        'text-sm leading-relaxed text-foreground',
        className,
      )}
      data-editor-surface="sheet"
      data-testid="rich-text-file-editor"
      onBlur={handleBlur}
      onMouseUpCapture={() => {
        if (editable) setFormattingToolbarVisible(!!window.getSelection()?.toString())
      }}
      onKeyDownCapture={handleEditorShellKeyDownCapture}
    >
      {warning ? (
        <div className="mb-3 flex items-center gap-2 rounded-md border border-warning/30 bg-warning/10 px-2.5 py-1.5 text-[11px] text-warning">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span className="font-medium">{warning.title}</span>
          <span className="text-warning/80">{warning.description}</span>
        </div>
      ) : null}
      <div className={cn('relative', editable && 'group/byline pl-7')}>
        {editorStatusControls}
        {editable && blockMenuOpen ? (
          <div
            role="menu"
            aria-label="块命令"
            aria-activedescendant={`rich-text-block-command-${blockCommands[blockMenuActiveIndex]?.id ?? 'paragraph'}`}
            className="absolute left-8 top-12 z-20 w-72 rounded-md border border-border/50 bg-popover p-1.5 text-xs shadow-lg"
          >
            {embedDraft ? (
              <form className="space-y-2 p-1" onSubmit={(event) => { event.preventDefault(); insertEmbed() }}>
                <p className="px-1 font-medium text-foreground">{embedDraft.kind === 'image' ? '插入图片' : '引用资源'}</p>
                <input
                  autoFocus
                  aria-label={embedDraft.kind === 'image' ? '图片地址' : '资源地址'}
                  className="h-8 w-full rounded-md border border-border/50 bg-background px-2 text-xs outline-none focus:border-primary"
                  placeholder="https://..."
                  value={embedDraft.url}
                  onChange={(event) => setEmbedDraft((current) => current ? { ...current, url: event.target.value } : current)}
                />
                <input
                  aria-label={embedDraft.kind === 'image' ? '图片说明' : '资源名称'}
                  className="h-8 w-full rounded-md border border-border/50 bg-background px-2 text-xs outline-none focus:border-primary"
                  placeholder={embedDraft.kind === 'image' ? '图片说明（可选）' : '资源名称（可选）'}
                  value={embedDraft.label}
                  onChange={(event) => setEmbedDraft((current) => current ? { ...current, label: event.target.value } : current)}
                />
                <div className="flex justify-end gap-1">
                  <button type="button" className="h-7 rounded px-2 text-muted-foreground hover:bg-muted" onClick={() => setEmbedDraft(null)}>返回</button>
                  <button type="submit" className="h-7 rounded bg-primary px-2 text-primary-foreground disabled:opacity-40" disabled={!normalizeEditableLinkHref(embedDraft.url)}>插入</button>
                </div>
              </form>
            ) : <>
            <label className="mb-1 flex h-8 items-center gap-2 rounded-md border border-border/45 bg-background px-2 text-muted-foreground">
              <Search className="h-3.5 w-3.5" aria-hidden="true" />
              <span className="sr-only">搜索块命令</span>
              <input
                autoFocus
                aria-label="搜索块命令"
                role="searchbox"
                className="min-w-0 flex-1 bg-transparent text-xs text-foreground outline-none"
                placeholder="搜索块类型"
                value={blockCommandQuery}
                onChange={(event) => {
                  setBlockCommandQuery(event.target.value)
                  commitBlockCommandMenuState(projectRichTextEditorBlockCommandMenuActiveIndexSet(
                    currentBlockCommandMenuState(), 0, Math.max(blockCommands.length, 1),
                  ))
                }}
              />
            </label>
            {blockCommands.map((item, index) => {
              const CommandIcon = item.id === 'table' ? Table2
                : item.id === 'image' ? ImageIcon
                  : item.id === 'reference' ? FileInput
                    : item.id === 'task' ? CheckSquare
                      : item.id === 'ordered-list' ? ListOrdered
                        : item.id === 'code-block' ? Code2
                          : item.id === 'quote' ? Quote
                            : item.id === 'heading-1' ? Heading1
                              : List
              return (
              <button
                key={item.id}
                id={`rich-text-block-command-${item.id}`}
                type="button"
                role="menuitem"
                aria-label={item.label}
                className={cn(
                  'flex w-full items-center rounded px-2 py-1.5 text-left text-foreground hover:bg-muted/70',
                  index === blockMenuActiveIndex && 'bg-muted/70',
                )}
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => {
                  commitBlockCommandMenuState(projectRichTextEditorBlockCommandMenuActiveIndexSet(
                    currentBlockCommandMenuState(),
                    index,
                    blockCommands.length,
                  ))
                }}
                onClick={() => runBlockCommand(item.id)}
              >
                <CommandIcon className="mr-2 h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                <span className="flex-1">{item.label}</span>
                <span className="text-[10px] text-muted-foreground">{item.markdownHint}</span>
              </button>
              )
            })}
            {blockCommands.length === 0 ? <p className="px-2 py-3 text-center text-muted-foreground">{commandProjection.emptyLabel}</p> : null}
            </>}
          </div>
        ) : null}
        {editable && blockMoveMenuOpen ? (
          <div
            role="menu"
            aria-label="块移动"
            className="absolute left-0 top-20 z-20 w-28 rounded-md border border-border/50 bg-popover p-1 text-xs shadow-lg"
          >
            <button
              type="button"
              role="menuitem"
              className="flex w-full items-center rounded px-2 py-1.5 text-left text-foreground hover:bg-muted/70 disabled:text-muted-foreground/40"
              disabled={!canMoveBlockUp}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => moveCurrentBlock(-1)}
            >
              上移块
            </button>
            <button
              type="button"
              role="menuitem"
              className="flex w-full items-center rounded px-2 py-1.5 text-left text-foreground hover:bg-muted/70 disabled:text-muted-foreground/40"
              disabled={!canMoveBlockDown}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => moveCurrentBlock(1)}
            >
              下移块
            </button>
          </div>
        ) : null}
        {editable ? (
          <div
            role="toolbar"
            aria-label="块操作"
            data-control-placement="byline"
            className="absolute left-0 top-10 flex w-6 flex-col items-center gap-0.5 text-muted-foreground opacity-0 transition-opacity duration-150 group-hover/byline:opacity-100 focus-within:opacity-100"
          >
            <button
              type="button"
              aria-label="插入段落块"
              title="插入段落块"
              className="inline-flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-muted/70 hover:text-foreground disabled:opacity-30"
              disabled={!editor}
              onMouseDown={(event) => event.preventDefault()}
              onClick={insertParagraphBlock}
            >
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
            <button
              type="button"
              aria-label="移动当前块"
              title="移动当前块"
              aria-expanded={blockMoveMenuOpen}
              className="inline-flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-muted/70 hover:text-foreground disabled:opacity-30"
              disabled={!editor}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => setBlockMoveMenuState(projectRichTextEditorBlockMoveMenuToggled)}
            >
              <GripVertical className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
        ) : null}
        {formattingToolbar}
        <EditorContent
          editor={editor}
          className={cn(
            'min-h-52 outline-none',
            '[&_.ProseMirror]:outline-none [&_.ProseMirror]:min-h-52',
            '[&_.ProseMirror_h1]:mb-5 [&_.ProseMirror_h1]:text-3xl [&_.ProseMirror_h1]:font-semibold [&_.ProseMirror_h1]:leading-tight',
            '[&_.ProseMirror_h2]:text-lg [&_.ProseMirror_h2]:font-semibold [&_.ProseMirror_h2]:mb-2',
            '[&_.ProseMirror_p]:my-2 [&_.ProseMirror_ul]:my-2 [&_.ProseMirror_ul]:pl-5',
            '[&_.ProseMirror_li]:list-disc',
          )}
        />
      </div>
    </div>
  )
}
