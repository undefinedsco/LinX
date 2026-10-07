import { useEffect, useRef, useState } from 'react'
import type { ClipboardEvent, FocusEvent, ReactNode } from 'react'

type SaveStatus = 'saved' | 'dirty' | 'saving' | 'error'

const STATUS_LABEL: Record<SaveStatus, string> = {
  saved: '已保存',
  saving: '正在保存',
  error: '保存失败',
  dirty: '未保存',
}

type FakeEditorProps = {
  content: { text?: string | null }
  editable?: boolean
  warning?: { title: string; description: string } | null
  onSaveText?: (text: string) => void | Promise<void>
  onDirtyChange?: (isDirty: boolean) => void
  onSaveStatusChange?: (status: SaveStatus) => void
  onSubmitProposal?: (text: string, summary: { title: string | null; links: string[] }) => void | Promise<void>
  proposalPending?: boolean
  proposalLabel?: string
}

function summarize(text: string): { title: string | null; links: string[] } {
  const title = text.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? null
  const links: string[] = []
  for (const match of text.matchAll(/\[[^\]]*\]\(([^)\s]+)\)/g)) {
    if (match[1]) links.push(match[1])
  }
  return { title, links }
}

function renderInline(text: string): ReactNode[] {
  const nodes: ReactNode[] = []
  const pattern = /\[([^\]]+)\]\(([^)\s]+)\)|\*\*([^*]+)\*\*|\*([^*\n]+)\*|`([^`]+)`/g
  let lastIndex = 0
  let match: RegExpExecArray | null
  let key = 0
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) nodes.push(text.slice(lastIndex, match.index))
    if (match[1] !== undefined) {
      nodes.push(<a key={key++} href={match[2]}>{match[1]}</a>)
    } else if (match[3] !== undefined) {
      nodes.push(<strong key={key++}>{match[3]}</strong>)
    } else if (match[4] !== undefined) {
      nodes.push(<em key={key++}>{match[4]}</em>)
    } else if (match[5] !== undefined) {
      nodes.push(<code key={key++}>{match[5]}</code>)
    }
    lastIndex = pattern.lastIndex
  }
  if (lastIndex < text.length) nodes.push(text.slice(lastIndex))
  return nodes
}

export function BlockNoteFileEditor({
  content,
  editable = false,
  warning = null,
  onSaveText,
  onDirtyChange,
  onSaveStatusChange,
  onSubmitProposal,
  proposalPending = false,
  proposalLabel = '审批',
}: FakeEditorProps) {
  const initial = content.text ?? ''
  const [text, setText] = useState(initial)
  const [dirty, setDirty] = useState(false)
  const [status, setStatus] = useState<SaveStatus>('saved')
  const lastSavedRef = useRef(initial)

  useEffect(() => {
    lastSavedRef.current = initial
    setText(initial)
    setDirty(false)
    setStatus('saved')
  }, [initial])

  useEffect(() => {
    onDirtyChange?.(dirty)
  }, [dirty, onDirtyChange])

  useEffect(() => {
    onSaveStatusChange?.(status)
  }, [status, onSaveStatusChange])

  const markDirty = (next: string) => {
    setText(next)
    setDirty(next !== lastSavedRef.current)
    setStatus(next !== lastSavedRef.current ? 'dirty' : 'saved')
  }

  const handlePaste = (event: ClipboardEvent<HTMLDivElement>) => {
    if (!editable) return
    event.preventDefault()
    markDirty(event.clipboardData?.getData('text/plain') ?? '')
  }

  const handleBlur = async (event: FocusEvent<HTMLDivElement>) => {
    const next = event.relatedTarget instanceof Node ? event.relatedTarget : null
    if (next && event.currentTarget.contains(next)) return
    if (!editable || !onSaveText || !dirty) return
    if (text === lastSavedRef.current) {
      setDirty(false)
      setStatus('saved')
      return
    }
    setStatus('saving')
    try {
      await onSaveText(text)
      lastSavedRef.current = text
      setDirty(false)
      setStatus('saved')
    } catch (_error) {
      setStatus('error')
    }
  }

  const handleSubmitProposal = async () => {
    if (!editable || !onSubmitProposal || !dirty || proposalPending) return
    await onSubmitProposal(text, summarize(text))
    lastSavedRef.current = text
    setDirty(false)
    setStatus('saved')
  }

  const heading = text.match(/^#\s+(.+)$/m)?.[1] ?? null
  const body = text.replace(/^#\s+.+$/m, '').trim()

  return (
    <div data-testid="rich-text-file-editor">
      {warning ? (
        <div role="alert">
          <p>{warning.title}</p>
          <p>{warning.description}</p>
        </div>
      ) : null}
      <div
        className="ProseMirror"
        contentEditable={editable}
        suppressContentEditableWarning
        role="textbox"
        aria-label="富文本编辑器"
        onPaste={handlePaste}
        onBlur={handleBlur}
      >
        {heading ? <h1>{heading}</h1> : null}
        {body
          ? body.split('\n').filter((line) => line.trim()).map((line, index) => <p key={index}>{renderInline(line)}</p>)
          : null}
      </div>
      {editable ? (
        <div>
          <span data-rich-text-save-status={status}>{STATUS_LABEL[status]}</span>
          {onSubmitProposal ? (
            <button
              type="button"
              disabled={!dirty || proposalPending}
              aria-label={`提交 ${proposalLabel}`}
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

export const extractBlockNoteDocumentSummary = summarize
