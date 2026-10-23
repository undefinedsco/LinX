import { useEffect, useRef } from 'react'
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
  onCommit,
  onCancel,
}: {
  markdown: string
  onCommit: (markdown: string) => void
  onCancel: () => void
}) {
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
    if (next === markdown.trim()) onCancel()
    else onCommit(next)
  }

  return (
    <div
      ref={containerRef}
      className="nodrag nowheel nopan h-full w-full overflow-auto text-xs"
      data-whiteboard-body-editor="true"
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.stopPropagation()
          void finish(false)
        }
      }}
      onBlur={(event) => {
        if (!containerRef.current?.contains(event.relatedTarget as Node | null)) void finish(true)
      }}
    >
      <BlockNoteView editor={editor} theme="light" sideMenu={false} slashMenu={false} />
    </div>
  )
}
