import { useEffect, useRef, useState } from 'react'
import { BlockNoteView } from '@blocknote/mantine'
import { zh } from '@blocknote/core/locales'
import { useCreateBlockNote } from '@blocknote/react'
import '@blocknote/mantine/style.css'

/**
 * Inline body editor for a whiteboard card (BlockNote). Loaded on demand so the
 * board itself stays light until someone double-clicks a card.
 */
export default function WhiteboardBodyEditor({
  markdown,
  title,
  onCommit,
  onCancel,
}: {
  markdown: string
  /** Given for cards that have a title to edit as well (table rows). */
  title?: string
  onCommit: (markdown: string, title?: string) => void
  onCancel: () => void
}) {
  const [titleDraft, setTitleDraft] = useState(title ?? '')
  const editor = useCreateBlockNote({ dictionary: zh })
  const doneRef = useRef(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      if (!markdown.trim()) return
      const blocks = await editor.tryParseMarkdownToBlocks(markdown)
      if (!cancelled) editor.replaceBlocks(editor.document, blocks)
    })()
    return () => { cancelled = true }
  }, [editor, markdown])

  const finish = async (save: boolean) => {
    if (doneRef.current) return
    doneRef.current = true
    if (!save) {
      onCancel()
      return
    }
    const next = (await editor.blocksToMarkdownLossy(editor.document)).trim()
    const nextTitle = titleDraft.trim()
    const titleChanged = title !== undefined && nextTitle !== '' && nextTitle !== title
    if (next === markdown.trim() && !titleChanged) onCancel()
    else onCommit(next, titleChanged ? nextTitle : undefined)
  }

  return (
    <div
      ref={containerRef}
      className="nodrag nowheel nopan h-full w-full overflow-auto text-xs"
      data-whiteboard-body-editor="true"
      onKeyDown={(event) => {
        // Escape keeps what was typed and leaves edit mode, like clicking outside.
        if (event.key === 'Escape') {
          event.stopPropagation()
          void finish(true)
        }
      }}
      onBlur={(event) => {
        if (!containerRef.current?.contains(event.relatedTarget as Node | null)) void finish(true)
      }}
    >
      {title !== undefined ? (
        <input
          autoFocus
          aria-label="卡片标题"
          className="mb-1 w-full bg-transparent text-[13px] font-semibold outline-none"
          value={titleDraft}
          onChange={(event) => setTitleDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              editor.focus()
            }
          }}
        />
      ) : null}
      <BlockNoteView editor={editor} theme="light" sideMenu={false} slashMenu={false} />
    </div>
  )
}
