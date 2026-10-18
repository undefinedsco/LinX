import { useCallback, useEffect, useState } from 'react'
import { AiDraftMessageBar } from '@/modules/files'
import { displayAssistantName } from '@/lib/assistant-name'
import { FileText, FileSpreadsheet, FileImage, File as FileIcon, CalendarClock, Sparkles, PencilLine } from 'lucide-react'
import { agentResource, scheduleResource } from '@undefineds.co/models'
import { Button } from '@/components/ui/button'
import { useCardDialog } from '@/lib/card-dialog'
import { useEntity } from '@/lib/data/use-entity'
import { updateExactRecord } from '@/lib/data/exact-records'
import { useSession } from '@/providers/solid-session-context'
import { useSolidDatabase } from '@/providers/solid-database-provider'
import { LINX_DEFAULT_SECRETARY, chatOps } from '../../../collections'
import { agentCollection } from '../../../contacts-port'
import { useConversationIdentity } from '../ConversationContext'
import { CardShell, CardUnavailable } from './CardShell'
import { describeSchedule, fileKindLabel, formatFileSize, nameFromUri } from './other-card-model'

type FileState =
  | { state: 'loading' }
  | { state: 'ready'; contentType: string | null; size: number | null }
  | { state: 'gone' }
  | { state: 'unreadable' }

function useFileState(uri: string, writing: boolean): FileState {
  const { session } = useSession()
  const authFetch = session.fetch
  const [state, setState] = useState<FileState>({ state: 'loading' })
  useEffect(() => {
    if (writing || !authFetch) return
    let disposed = false
    setState({ state: 'loading' })
    void authFetch(uri, { method: 'HEAD' }).then((response) => {
      if (disposed) return
      if (response.status === 404 || response.status === 410) return setState({ state: 'gone' })
      if (!response.ok) return setState({ state: 'unreadable' })
      const length = Number(response.headers.get('content-length'))
      setState({
        state: 'ready',
        contentType: response.headers.get('content-type'),
        size: Number.isFinite(length) && length > 0 ? length : null,
      })
    }).catch(() => { if (!disposed) setState({ state: 'unreadable' }) })
    return () => { disposed = true }
  }, [authFetch, uri, writing])
  return state
}

function FileGlyph({ contentType, name }: { contentType: string | null; name: string }) {
  const type = `${contentType ?? ''} ${name}`.toLowerCase()
  const className = 'h-5 w-5'
  if (/sheet|excel|csv|xlsx|xls/u.test(type)) return <FileSpreadsheet className={className} />
  if (/image|png|jpe?g|gif|webp/u.test(type)) return <FileImage className={className} />
  if (/text|markdown|\.md|word|docx|pdf/u.test(type)) return <FileText className={className} />
  return <FileIcon className={className} />
}

/** 文件 (W4): the file itself, like a file sent in WeChat. Opens in the card dialog. */
export function FileCard({ uri, hints, onRetry }: { uri: string; hints?: Record<string, string>; onRetry?: () => void }) {
  const writing = hints?.state === 'writing'
  const failed = hints?.state === 'failed'
  const file = useFileState(uri, writing || failed)
  const name = hints?.name || nameFromUri(uri)
  const open = useCardDialog((state) => state.open)

  if (writing) {
    return <CardShell tone="quiet" label={`文件 ${name}`}><p className="text-xs" role="status">{name} · 正在写…</p></CardShell>
  }
  if (failed) {
    return (
      <CardShell tone="warning" label={`文件 ${name}`}>
        <p className="text-sm">{name}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">没写成，可以再试一次</p>
        {onRetry ? <Button size="sm" variant="outline" className="mt-2" onClick={onRetry}>重试</Button> : null}
      </CardShell>
    )
  }
  if (file.state === 'gone') {
    return <CardUnavailable label={`文件 ${name}`} reason={`${name} · 这个文件已经删除`} />
  }
  if (file.state === 'unreadable') {
    return <CardUnavailable label={`文件 ${name}`} reason={`${name} · 现在读不到这个文件，可能没有权限或没有网络`} />
  }
  const contentType = file.state === 'ready' ? file.contentType : null
  const size = file.state === 'ready' ? file.size : null
  return (
    <div className="flex max-w-[320px] flex-col">
    <button
      type="button"
      aria-label={`打开 ${name}`}
      onClick={() => open({ uri, from: 'chat' })}
      className="flex w-full max-w-[320px] items-center gap-3 rounded-lg border border-border bg-card px-3 py-2.5 text-left hover:bg-muted/40"
    >
      <span className="text-primary" aria-hidden="true"><FileGlyph contentType={contentType} name={name} /></span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{name}</span>
        <span className="block text-xs text-muted-foreground">
          {file.state === 'loading' ? '正在读取…' : [fileKindLabel(contentType, name), size ? formatFileSize(size) : null].filter(Boolean).join(' · ')}
        </span>
      </span>
    </button>
    {/* K10: keep / undo LinX's unconfirmed edits right from the file message. */}
    <AiDraftMessageBar targetResourceUri={uri} />
    </div>
  )
}

/** 未确认的改动 (K10): this round it is shown, keep / undo come in the next wave. */
export function PendingChangeCard({ uri, hints }: { uri: string; hints?: Record<string, string> }) {
  const open = useCardDialog((state) => state.open)
  const name = hints?.name || nameFromUri(uri)
  const count = Number(hints?.changes)
  return (
    <CardShell label={`未确认的改动 ${name}`} icon={<PencilLine className="h-4 w-4" />}>
      <p className="text-sm font-medium">{name}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">
        {Number.isFinite(count) && count > 0 ? `改了 ${count} 处 · 还没确认` : '有改动 · 还没确认'}
      </p>
      <Button size="sm" variant="outline" className="mt-2" onClick={() => open({ uri, from: 'chat' })}>查看改动</Button>
    </CardShell>
  )
}

/** 计划 (W6): the topic's plan. */
export function PlanCard({ uri }: { uri: string }) {
  const { data: schedule, isLoading, error, refresh } = useEntity(scheduleResource, uri)
  const { db } = useSolidDatabase()
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const change = useCallback(async (status: 'active' | 'paused') => {
    if (!db) return
    setBusy(true)
    setFailed(false)
    try {
      await updateExactRecord(db, scheduleResource as never, uri, { status, updatedAt: new Date() })
      await refresh()
    } catch {
      setFailed(true)
    } finally {
      setBusy(false)
    }
  }, [db, refresh, uri])

  if (isLoading && !schedule) return <CardShell tone="quiet" label="计划"><p className="text-xs" role="status">正在读取…</p></CardShell>
  if (!schedule || error) return <CardUnavailable label="计划" reason="这个计划读不到了：可能已被删除，或当前账号没有权限查看。" />
  const active = schedule.status === 'active'
  const description = describeSchedule(schedule, new Date())
  return (
    <CardShell label="计划" icon={<CalendarClock className="h-4 w-4" />}>
      <p className="font-medium">{description.repeat}</p>
      {description.next ? <p className="mt-0.5 text-xs text-muted-foreground">下一次：{description.next}</p> : null}
      <p className="mt-0.5 text-xs text-muted-foreground">{active ? '已开着，到点自动运行' : '还没开着，不会运行'}</p>
      {failed ? <p role="alert" className="mt-2 text-xs text-destructive">没改成，原来的计划不变。</p> : null}
      <div className="mt-3 flex gap-2">
        {active ? (
          <Button size="sm" variant="outline" disabled={busy} onClick={() => void change('paused')}>关掉</Button>
        ) : (
          <Button size="sm" disabled={busy} onClick={() => void change('active')}>{busy ? '正在开启…' : '确认'}</Button>
        )}
      </div>
    </CardShell>
  )
}

/** 起名字 (W0): renames the assistant; identity and history stay. */
export function NamingCard({ uri, onNamed }: { uri: string | null; onNamed?: (name: string) => void }) {
  const identity = useConversationIdentity()
  const { data: entity, isLoading, refresh } = useEntity(agentResource, uri || null)
  // A brand-new assistant may exist only in the local collection until its first message.
  const agent = entity ?? (identity.isSecretary ? agentCollection?.get?.(LINX_DEFAULT_SECRETARY.agentId) ?? null : null)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const currentName = displayAssistantName((typeof agent?.name === 'string' && agent.name) || identity.agentName)

  const save = async (value: string) => {
    const next = value.trim() || currentName
    const clash = Array.from(agentCollection?.state?.values?.() ?? []).some((other) => other.id !== agent?.id && other.name === next)
    if (clash) {
      setMessage(`“${next}”已经有了，换一个吧，免得在列表里分不清。`)
      return
    }
    if (!agent?.id) return
    setBusy(true)
    setMessage(null)
    try {
      if (next !== currentName) {
        await chatOps.updateAgentProfile({
          agentId: agent.id,
          currentAgent: agent as never,
          name: next,
          chatId: identity.chatId,
          contactId: identity.contactId ?? undefined,
        })
        await refresh()
      }
      setDone(next)
      onNamed?.(next)
    } catch {
      setMessage('没改成，原来的名字不变。可以再试一次。')
    } finally {
      setBusy(false)
    }
  }

  if (isLoading && !agent) return <CardShell tone="quiet" label="起名字"><p className="text-xs" role="status">正在读取…</p></CardShell>
  if (!agent) return <CardUnavailable label="起名字" reason="读不到助手的资料，稍后再起名字也可以。" />
  if (done) return <CardShell tone="quiet" label="起名字"><p className="text-xs" role="status">好，以后我叫{done}。</p></CardShell>
  return (
    <CardShell label="起名字" icon={<Sparkles className="h-4 w-4" />}>
      <p className="font-medium">先给我起个名字吧</p>
      <input
        aria-label="助手的名字"
        value={name}
        placeholder={currentName}
        maxLength={24}
        onChange={(event) => { setName(event.target.value); setMessage(null) }}
        className="mt-2 h-8 w-full rounded-md border border-input bg-background px-2 text-sm"
      />
      {message ? <p role="alert" className="mt-1.5 text-xs text-destructive">{message}</p> : null}
      <div className="mt-3 flex items-center gap-2">
        <Button size="sm" variant="outline" disabled={busy} onClick={() => void save('')}>就叫 {currentName}</Button>
        <Button size="sm" disabled={busy || !name.trim()} onClick={() => void save(name)}>{busy ? '正在改…' : '好'}</Button>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">以后在聊天信息里也能改，改名不会丢聊天记录</p>
    </CardShell>
  )
}
