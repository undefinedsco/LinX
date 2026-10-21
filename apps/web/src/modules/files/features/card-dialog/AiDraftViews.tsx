import { useMemo } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/use-toast'

import { useActOnAiDraft, useAiDraft } from '../../data/queries'
import {
  projectAiDraftBanner,
  projectAiDraftMessageBar,
  projectAiDraftSegments,
  type AiDraft,
} from '../../domain/proposal/ai-draft-model'
import { formatFilesErrorForUser } from '@/lib/user-facing-errors'

type DraftAction = 'keep' | 'undo' | 'reapply' | { undoSpot: number }

const ACTION_LABEL = { undo: '撤销', keep: '保留', redo: '重新应用' } as const

function useDraftActions(draft: AiDraft | null | undefined) {
  const { toast } = useToast()
  const act = useActOnAiDraft()
  return {
    pending: act.isPending,
    run: async (action: DraftAction) => {
      if (!draft) return
      try {
        await act.mutateAsync({ draft, action })
      } catch (error) {
        toast({
          title: '没处理成功',
          description: formatFilesErrorForUser(error, '没处理成功，请重试。'),
          variant: 'destructive',
        })
      }
    },
  }
}

const PROSE = 'text-sm leading-6 [&_h1]:text-xl [&_h1]:font-semibold [&_h2]:text-lg [&_h2]:font-semibold [&_h3]:font-semibold [&_li]:ml-5 [&_li]:list-disc [&_p]:my-1.5 [&_table]:my-2 [&_td]:border [&_td]:px-2 [&_th]:border [&_th]:px-2'

function Markdown({ text }: { text: string }) {
  return (
    <div className={PROSE}>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
    </div>
  )
}

/** "LinX 改了 3 处，还没确认" with 撤销 / 保留 (K10, K10b). */
export function AiDraftBanner({ draft, currentContent }: { draft: AiDraft | null | undefined; currentContent?: string | null }) {
  const { run, pending } = useDraftActions(draft)
  const banner = projectAiDraftBanner(draft, currentContent)
  if (!banner) return null
  const tint = banner.tone === 'unconfirmed' ? 'bg-primary/10 text-primary' : 'bg-muted/60 text-muted-foreground'
  return (
    <div data-ai-draft-banner={banner.tone} className={`mb-4 flex items-center gap-3 rounded-lg px-3 py-2 text-sm ${tint}`}>
      <span className="flex-1">
        {banner.text}
        {banner.tone === 'unconfirmed' ? <span className="text-xs opacity-70"> · 你接着改就算保留</span> : null}
      </span>
      {banner.actions.map((action) => (
        <Button
          key={action}
          size="sm"
          variant={action === 'keep' ? 'default' : 'ghost'}
          disabled={pending}
          onClick={() => { void run(action === 'redo' ? 'reapply' : action) }}
        >
          {ACTION_LABEL[action]}
        </Button>
      ))}
    </div>
  )
}

/**
 * The file as it would read once LinX's changes are kept: changed spots tinted purple, hover a
 * spot to see what it said before and undo just that spot. Clicking into the text is editing,
 * and editing means keeping.
 */
export function AiDraftReview({ draft, onEdit }: { draft: AiDraft; onEdit: () => void }) {
  const { run, pending } = useDraftActions(draft)
  const segments = useMemo(() => projectAiDraftSegments(draft.baseContent, draft.draftContent), [draft.baseContent, draft.draftContent])
  return (
    <div
      data-ai-draft-review="true"
      className="min-h-[200px] cursor-text"
      onClick={(event) => {
        if ((event.target as HTMLElement).closest('button')) return
        if (typeof window !== 'undefined' && window.getSelection()?.toString()) return
        onEdit()
      }}
    >
      {segments.map((segment, index) => {
        if (segment.type === 'same') return segment.text.trim() ? <Markdown key={index} text={segment.text} /> : null
        return (
          <div
            key={index}
            data-ai-draft-spot={segment.spot}
            className="group relative -mx-2 my-1 rounded-md bg-primary/10 px-2"
          >
            {segment.draftText.trim()
              ? <Markdown text={segment.draftText} />
              : <p className="py-1 text-sm text-muted-foreground line-through">{segment.baseText.trim()}</p>}
            <div className="absolute right-1 top-1 hidden items-center gap-2 rounded-md bg-background/95 px-2 py-1 text-xs shadow group-hover:flex">
              {segment.baseText.trim() ? (
                <span className="max-w-[260px] truncate text-muted-foreground">原来是“{segment.baseText.trim()}”</span>
              ) : <span className="text-muted-foreground">新加的</span>}
              <button
                type="button"
                disabled={pending}
                className="text-primary hover:underline"
                onClick={() => { void run({ undoSpot: segment.spot }) }}
              >
                撤销这处
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}

/** The same keep / undo under a file message in chat, without opening the file (K10). */
export function AiDraftMessageBar({ targetResourceUri }: { targetResourceUri: string }) {
  const { data: draft } = useAiDraft(targetResourceUri)
  const { run, pending } = useDraftActions(draft)
  const bar = projectAiDraftMessageBar(draft)
  if (!bar) return null
  return (
    <div data-ai-draft-message-bar="true" className="mt-1.5 flex items-center gap-2 text-xs text-primary">
      <span>{bar.text}</span>
      {bar.actions.map((action) => (
        <button key={action} type="button" disabled={pending} className="hover:underline" onClick={() => { void run(action) }}>
          {ACTION_LABEL[action]}
        </button>
      ))}
    </div>
  )
}
