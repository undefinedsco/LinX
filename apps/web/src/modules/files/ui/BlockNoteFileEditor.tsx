import { useEffect, useMemo, useRef, useState } from 'react'
import type { FocusEvent } from 'react'
import { BlockNoteView } from '@blocknote/mantine'
import { useCreateBlockNote } from '@blocknote/react'
import '@blocknote/mantine/style.css'

import { cn } from '@/lib/utils'
import {
  createRichTextEditorSaveState,
  getRichTextEditorSaveStatusLabel,
  projectRichTextEditorSaveStateAfterDirtyComparison,
  projectRichTextEditorSaveStateAfterSaveError,
  projectRichTextEditorSaveStateAfterSaveSuccess,
  projectRichTextEditorSaveStateBeforeSave,
  type RichTextEditorDocumentSummary,
  type RichTextEditorSaveState,
  type RichTextEditorSaveStatus,
} from './rich-text-file-editor-model'

export type BlockNoteEditorContent = {
  inputFormat: 'html' | 'markdownish'
  saveFormat: 'markdown' | 'plain-text'
  text?: string | null
}

export type BlockNoteEditorWarning = {
  title: string
  description: string
}

type AnyBlock = Record<string, unknown>

function collectDocumentSummary(blocks: readonly AnyBlock[]): RichTextEditorDocumentSummary {
  let title: string | null = null
  const links: string[] = []
  const seen = new Set<string>()

  const visitInline = (content: unknown) => {
    if (!Array.isArray(content)) return
    for (const inline of content) {
      const styles = (inline as { styles?: Record<string, unknown> }).styles
      const href = styles && typeof styles === 'object' ? (styles.link as string | undefined) : undefined
      if (href && !seen.has(href)) {
        seen.add(href)
        links.push(href)
      }
    }
  }

  const visit = (block: AnyBlock) => {
    if (title === null && block.type === 'heading') {
      const content = (block.content as unknown) ?? []
      const text = Array.isArray(content)
        ? content.map((inline) => String((inline as { text?: string }).text ?? '')).join('')
        : ''
      if (text.trim()) title = text.trim()
    }
    visitInline((block as { content?: unknown }).content)
    const children = (block as { children?: AnyBlock[] }).children
    if (Array.isArray(children)) children.forEach(visit)
  }

  blocks.forEach(visit)
  return { title, links }
}

export function extractBlockNoteDocumentSummary(blocks: readonly AnyBlock[]): RichTextEditorDocumentSummary {
  return collectDocumentSummary(blocks)
}

export function BlockNoteFileEditor({
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
  content: BlockNoteEditorContent
  className?: string
  editable?: boolean
  warning?: BlockNoteEditorWarning | null
  onSaveText?: (text: string) => void | Promise<void>
  onDirtyChange?: (isDirty: boolean) => void
  onSaveStatusChange?: (status: RichTextEditorSaveStatus) => void
  onSubmitProposal?: (text: string, documentSummary: RichTextEditorDocumentSummary) => void | Promise<void>
  proposalPending?: boolean
  proposalLabel?: string
}) {
  const initialText = content.text ?? ''
  const dirtyRef = useRef(false)
  const lastSavedTextRef = useRef<string | null>(null)
  const [saveState, setSaveState] = useState<RichTextEditorSaveState>(createRichTextEditorSaveState)

  const editor = useCreateBlockNote()

  const serialize = (blocks: readonly AnyBlock[]): string => {
    if (content.saveFormat === 'plain-text') {
      const lines: string[] = []
      const visit = (block: AnyBlock, depth = 0) => {
        const contentValue = (block as { content?: unknown }).content
        const text = Array.isArray(contentValue)
          ? contentValue.map((inline) => String((inline as { text?: string }).text ?? '')).join('')
          : ''
        if (text.trim()) lines.push(`${'  '.repeat(depth)}${text}`)
        const children = (block as { children?: AnyBlock[] }).children
        if (Array.isArray(children)) children.forEach((child) => visit(child, depth + 1))
      }
      blocks.forEach((block) => visit(block))
      return lines.join('\n')
    }
    return editor.blocksToMarkdownLossy(blocks as never)
  }

  const savedText = useMemo(() => initialText, [initialText])
  if (lastSavedTextRef.current === null) {
    lastSavedTextRef.current = savedText
  }

  useEffect(() => {
    lastSavedTextRef.current = savedText
    const nextSaveState = projectRichTextEditorSaveStateAfterSaveSuccess()
    dirtyRef.current = nextSaveState.isDirty
    setSaveState(nextSaveState)
    const blocks =
      content.inputFormat === 'html'
        ? editor.tryParseHTMLToBlocks(savedText)
        : editor.tryParseMarkdownToBlocks(savedText)
    editor.replaceBlocks(editor.document, blocks)
  }, [savedText, content.inputFormat, editor])

  useEffect(() => {
    onDirtyChange?.(saveState.isDirty)
  }, [onDirtyChange, saveState.isDirty])

  useEffect(() => {
    onSaveStatusChange?.(saveState.status)
  }, [onSaveStatusChange, saveState.status])

  const handleChange = () => {
    const nextText = serialize(editor.document as unknown as AnyBlock[])
    const nextSaveState = projectRichTextEditorSaveStateAfterDirtyComparison(nextText !== lastSavedTextRef.current)
    dirtyRef.current = nextSaveState.isDirty
    setSaveState(nextSaveState)
  }

  const handleBlur = async (event: FocusEvent<HTMLDivElement>) => {
    const nextFocusTarget = event.relatedTarget instanceof Node ? event.relatedTarget : null
    if (nextFocusTarget && event.currentTarget.contains(nextFocusTarget)) return
    if (!editable || !onSaveText || !dirtyRef.current) return
    const nextText = serialize(editor.document as unknown as AnyBlock[])
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
    if (!editable || !onSubmitProposal || !dirtyRef.current || proposalPending) return
    const blocks = editor.document as unknown as AnyBlock[]
    const nextText = serialize(blocks)
    await onSubmitProposal(nextText, collectDocumentSummary(blocks))
    lastSavedTextRef.current = nextText
    const nextSaveState = projectRichTextEditorSaveStateAfterSaveSuccess()
    dirtyRef.current = nextSaveState.isDirty
    setSaveState(nextSaveState)
  }

  return (
    <div
      data-testid="rich-text-file-editor"
      className={cn('rounded-md border border-border/40 bg-background shadow-sm', className)}
      onBlur={handleBlur}
    >
      {warning ? (
        <div
          role="alert"
          className="border-b border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning"
        >
          <p className="font-medium">{warning.title}</p>
          <p className="mt-0.5 text-warning/80">{warning.description}</p>
        </div>
      ) : null}
      <BlockNoteView
        editor={editor}
        editable={editable}
        onChange={handleChange}
        theme="light"
      />
      {editable ? (
        <div className="flex items-center justify-between gap-2 border-t border-border/30 px-3 py-2">
          <span className="text-[11px] text-muted-foreground" data-rich-text-save-status={saveState.status}>
            {getRichTextEditorSaveStatusLabel(saveState.status)}
          </span>
          {onSubmitProposal ? (
            <button
              type="button"
              disabled={!saveState.isDirty || proposalPending}
              aria-label={`提交 ${proposalLabel}`}
              className="inline-flex h-7 items-center rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground disabled:opacity-50"
              onClick={handleSubmitProposal}
            >
              {proposalPending ? '提交中...' : `提交 ${proposalLabel}`}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
