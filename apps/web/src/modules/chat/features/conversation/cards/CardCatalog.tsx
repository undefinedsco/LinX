import { useEffect, useState } from 'react'
import { BookmarkCheck } from 'lucide-react'
import type { ToolCallMessagePartProps } from '@assistant-ui/react'
import { useAui } from '@assistant-ui/react'
import { readLinxCardSurface, type LinxCardSurface } from '@linx/agent-runtime/ag-ui'
import { useCardDialog } from '@/lib/card-dialog'
import { useSession } from '@/providers/solid-session-context'
import { useOptionalConversationIdentity } from '../ConversationContext'
import { listRemembered, type RememberedNote } from '../memory/remembered'
import { ApprovalCard, InputCard, LoginCard } from './DecisionCards'
import { CardShell, CardUnavailable } from './CardShell'
import { FileCard, NamingCard, PendingChangeCard, PlanCard } from './OtherCards'

/** The A2UI surface assistant-ui synthesized from an ACTIVITY_SNAPSHOT is a `present` tool call. */
export function isLinxCardPart(part: { toolCallId?: string }): boolean {
  return typeof part.toolCallId === 'string' && part.toolCallId.startsWith('a2ui:')
}

interface A2uiOperationLike {
  updateComponents?: { components?: Array<{ id?: string; component?: string; text?: string }> }
}

/** One plain sentence for surfaces the LinX catalog does not know. */
export function readSurfaceFallbackText(operations: unknown): string | null {
  if (!Array.isArray(operations)) return null
  for (const operation of operations as A2uiOperationLike[]) {
    for (const node of operation?.updateComponents?.components ?? []) {
      if (node.component === 'Text' && typeof node.text === 'string') return node.text
    }
  }
  return null
}

function RememberedCard({ uri }: { uri: string }) {
  const { session } = useSession()
  const identity = useOptionalConversationIdentity()
  const open = useCardDialog((state) => state.open)
  const [note, setNote] = useState<RememberedNote | null | 'loading'>('loading')
  useEffect(() => {
    if (!identity?.rememberedUrl || !session.fetch) return
    let disposed = false
    void listRemembered(identity.rememberedUrl, session.fetch)
      .then((notes) => { if (!disposed) setNote(notes.find((entry) => entry.uri === uri) ?? null) })
      .catch(() => { if (!disposed) setNote(null) })
    return () => { disposed = true }
  }, [identity?.rememberedUrl, session.fetch, uri])
  if (note === 'loading') return <CardShell tone="quiet" label="记住"><p className="text-xs" role="status">正在读取…</p></CardShell>
  if (!note) return <CardUnavailable label="记住" reason="这条记住的内容读不到了：可能已被删除，或当前账号没有权限查看。" />
  return (
    <CardShell tone="quiet" label="记住" icon={<BookmarkCheck className="h-4 w-4" />}>
      <div className="flex items-center justify-between gap-3 text-xs">
        <span className="min-w-0 truncate">{note.replacedBy ? '已替换：' : '记住了：'}{note.content}</span>
        <button type="button" className="shrink-0 text-primary hover:underline" onClick={() => open({ uri, from: 'chat' })}>查看</button>
      </div>
    </CardShell>
  )
}

export function LinxCard({ surface }: { surface: LinxCardSurface }) {
  const aui = useAui()
  const reask = (title: string) => aui.thread().append(`请重新问我：${title}`)
  const interject = (text: string) => aui.thread().append(text)
  const { resource, hints } = surface
  switch (surface.card) {
    case 'approval':
    case 'auto-judge':
      return <ApprovalCard uri={resource} hints={hints} onReask={reask} />
    case 'command-permission':
      return <ApprovalCard uri={resource} hints={hints} variant="command" onReask={reask} />
    case 'input':
      return <InputCard uri={resource} hints={hints} onReask={reask} onInterject={interject} />
    case 'login':
      return <LoginCard uri={resource} hints={hints} onReask={reask} />
    case 'file':
      return <FileCard uri={resource} hints={hints} onRetry={() => aui.thread().append('请再试一次，把文件写出来')} />
    case 'pending-change':
      return <PendingChangeCard uri={resource} hints={hints} />
    case 'plan':
      return <PlanCard uri={resource} />
    case 'naming':
      return <NamingCard uri={resource} />
    case 'remember':
      return <RememberedCard uri={resource} />
    case 'run-progress':
    default:
      return surface.fallbackText
        ? <CardShell tone="quiet" label="进度"><p className="text-xs">{surface.fallbackText}</p></CardShell>
        : null
  }
}

/** Tool-call part renderer for A2UI card surfaces. */
export function LinxCardPart(props: ToolCallMessagePartProps) {
  const operations = (props.artifact as { a2ui?: unknown } | undefined)?.a2ui
  const surface = readLinxCardSurface(operations)
  if (!surface) {
    const text = readSurfaceFallbackText(operations)
    return text ? <p className="text-sm text-muted-foreground">{text}</p> : null
  }
  return <LinxCard surface={surface} />
}
