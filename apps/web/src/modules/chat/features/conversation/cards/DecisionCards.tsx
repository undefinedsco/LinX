import { useCallback, useState } from 'react'
import { ChevronDown, ExternalLink, LockKeyhole, MessageCircleQuestion, ShieldAlert, TerminalSquare, Timer } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { decisionKind, decisionOutcome, describeDecisionOutcome } from '@/modules/inbox/domain/decision-card'
import type { InboxItem } from '@/modules/inbox/domain/inbox-item'
import { isSecretInputRequest, parseInputRequestOptions } from '@/modules/inbox/domain/input-request'
import { isActionableInboxItem } from '@/modules/inbox/utils'
import { CardShell, CardUnavailable } from './CardShell'
import {
  CONFIDENCE_LABEL,
  formatRemaining,
  isHighImpactApproval,
  readAutoJudge,
  readPermissionCommand,
} from './card-model'
import { useDecisionActions } from './decision-actions'
import { useDecisionItem, useNow } from './useDecisionItem'

const SUBMIT_FAILED = '没提交成功，你的选择还在。重试不会重复发送。'

export interface DecisionCardProps {
  /** The Approval / InputRequest resource the card is bound to. */
  uri: string
  hints?: Record<string, string>
  /** Ask the assistant, in this topic, to ask again (expired requests). */
  onReask?: (title: string) => void
  /** Say something to the running work right now. */
  onInterject?: (text: string) => void
}

interface ActionState {
  busy: string | null
  error: string | null
  resolvedHere: boolean
  grantedUri: string | null
  grantNote: string | null
}

const IDLE: ActionState = { busy: null, error: null, resolvedHere: false, grantedUri: null, grantNote: null }

function useActionState() {
  const [state, setState] = useState<ActionState>(IDLE)
  const run = useCallback(async <T,>(busy: string, action: () => Promise<T>): Promise<T | undefined> => {
    setState((current) => ({ ...current, busy, error: null }))
    try {
      const result = await action()
      setState((current) => ({ ...current, busy: null, resolvedHere: true }))
      return result
    } catch {
      setState((current) => ({ ...current, busy: null, error: SUBMIT_FAILED }))
      return undefined
    }
  }, [])
  return { state, setState, run }
}

function plainDetail(item: InboxItem): Array<[string, string]> {
  const context = item.approval?.context ?? item.inputRequest?.context
  if (!context) return []
  try {
    const parsed: unknown = JSON.parse(context)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return Object.entries(parsed as Record<string, unknown>)
        .filter(([key, value]) => key !== 'autoJudge' && (typeof value === 'string' || typeof value === 'number'))
        .map(([key, value]) => [key, /^https?:\/\//u.test(String(value)) ? decodeURIComponent(String(value).split(/[/#]/u).filter(Boolean).pop() ?? '') : String(value)])
    }
  } catch {
    // Plain text context.
  }
  return [['', context]]
}

function titleOf(item: InboxItem, fallback: string): string {
  return item.title?.trim() || fallback
}

function Loading({ label }: { label: string }) {
  return (
    <CardShell tone="quiet" label={label}>
      <p className="text-xs" role="status">正在读取…</p>
    </CardShell>
  )
}

const MISSING = '这个请求读不到了：可能已被删除，或当前账号没有权限查看。'

function OutcomeLine({ item, resolvedHere, onReask, extra }: {
  item: InboxItem
  resolvedHere: boolean
  onReask?: (title: string) => void
  extra?: React.ReactNode
}) {
  const outcome = decisionOutcome(item)
  const text = outcome ? describeDecisionOutcome(item, outcome, resolvedHere) : '已处理'
  return (
    <CardShell tone="quiet" label={`${titleOf(item, '请求')}：${text}`}>
      <div role="status" className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs">
        <span className="min-w-0"><span className="text-foreground">{titleOf(item, '请求')}</span> · {text}</span>
        {outcome === 'expired' && !resolvedHere && onReask ? (
          <button type="button" className="text-primary hover:underline" onClick={() => onReask(titleOf(item, '刚才的请求'))}>
            让助手重新问一次
          </button>
        ) : null}
        {extra}
      </div>
    </CardShell>
  )
}

/** 审批 (W2) and 命令许可 (W10): one question, a consequence, a decision. */
export function ApprovalCard(props: DecisionCardProps & { variant?: 'approval' | 'command' }) {
  const lookup = useDecisionItem(props.uri, props.hints?.toolCallId)
  const label = props.variant === 'command' ? '命令许可' : '审批'
  if (lookup.state === 'loading') return <Loading label={label} />
  if (lookup.state === 'missing') return <CardUnavailable label={label} reason={MISSING} />
  return <ApprovalBody {...props} item={lookup.item} />
}

export function ApprovalBody({ item, onReask, variant = 'approval' }: DecisionCardProps & { item: InboxItem; variant?: 'approval' | 'command' }) {
  const actions = useDecisionActions()
  const { state, setState, run } = useActionState()
  const [delegate, setDelegate] = useState(false)
  const [showDetail, setShowDetail] = useState(false)
  const [confirming, setConfirming] = useState<null | 'delegate'>(null)
  const approval = item.approval
  const kind = decisionKind(item)
  if (!approval || kind === null) {
    return <CardUnavailable label="审批" reason={MISSING} />
  }

  const label = variant === 'command' ? '命令许可' : '审批'
  const pending = isActionableInboxItem(item)
  const question = titleOf(item, '需要你决定')
  const auto = readAutoJudge(approval)

  if (!pending) {
    const granted = state.grantedUri
    return (
      <OutcomeLine
        item={item}
        resolvedHere={state.resolvedHere}
        onReask={onReask}
        extra={granted ? (
          <span className="flex items-center gap-2">
            <span>以后“{question}”LinX 自己判断</span>
            <button
              type="button"
              className="text-primary hover:underline"
              onClick={() => void run('revoke', async () => {
                await actions.revokeGrant(granted)
                setState((current) => ({ ...current, grantedUri: null, grantNote: '已收回授权，以后这类还会问你' }))
              })}
            >
              收回
            </button>
          </span>
        ) : state.grantNote ? <span>{state.grantNote}</span> : null}
      />
    )
  }

  if (auto) return <AutoJudgeBody item={item} question={question} onReask={onReask} />

  const busy = state.busy
  const detail = plainDetail(item)
  const command = variant === 'command' ? readPermissionCommand(approval) : null

  const decide = (withDelegate: boolean) => {
    void run('approve', async () => {
      const outcome = await actions.approve({ approval, question, delegate: withDelegate })
      if (outcome.granted) setState((current) => ({ ...current, grantedUri: outcome.grantUri }))
      else if ('grantFailed' in outcome) setState((current) => ({ ...current, grantNote: '已批准，但没能保存授权，以后还会问你' }))
    })
  }
  const askApprove = (withDelegate: boolean) => {
    if (withDelegate && isHighImpactApproval(approval)) setConfirming('delegate')
    else decide(withDelegate)
  }

  return (
    <CardShell
      label={label}
      icon={variant === 'command' ? <TerminalSquare className="h-4 w-4" /> : <ShieldAlert className="h-4 w-4" />}
    >
      <p className="font-medium">{variant === 'command' ? `运行 ${command?.command ?? question}？` : question}</p>
      {variant === 'command' ? (
        <p className="mt-0.5 text-xs text-muted-foreground">
          {[command?.folder ? `在 ${command.folder}` : null, command?.network === true ? '会联网' : command?.network === false ? '不联网' : null]
            .filter(Boolean).join(' · ') || question}
        </p>
      ) : item.description ? (
        <p className="mt-0.5 text-xs text-muted-foreground">{item.description}</p>
      ) : null}
      {detail.length > 0 ? (
        <>
          <button
            type="button"
            className="mt-1 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            aria-expanded={showDetail}
            onClick={() => setShowDetail((value) => !value)}
          >
            详情 <ChevronDown className={cn('h-3 w-3 transition-transform', showDetail && 'rotate-180')} />
          </button>
          {showDetail ? (
            <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded bg-muted/50 px-2 py-1.5 text-xs text-muted-foreground">
              {detail.map(([key, value], index) => (
                key ? (
                  <div key={`${key}-${index}`} className="contents"><dt>{key}</dt><dd className="text-foreground">{value}</dd></div>
                ) : <dd key={index} className="col-span-2 whitespace-pre-wrap">{value}</dd>
              ))}
            </dl>
          ) : null}
        </>
      ) : null}

      {state.error ? (
        <p role="alert" className="mt-2 text-xs text-destructive">{state.error}</p>
      ) : null}

      {variant === 'command' ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => void run('reject', () => actions.reject(approval))}>拒绝</Button>
          <Button size="sm" disabled={busy !== null} onClick={() => askApprove(false)}>
            {busy === 'approve' ? '正在允许…' : '允许这一次'}
          </Button>
          <Button size="sm" variant="ghost" disabled={busy !== null} onClick={() => askApprove(true)}>以后交给 LinX 判断</Button>
        </div>
      ) : (
        <>
          <div className="mt-3 flex items-center gap-2">
            <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => void run('reject', () => actions.reject(approval))}>
              {busy === 'reject' ? '正在拒绝…' : '拒绝'}
            </Button>
            <Button size="sm" disabled={busy !== null} onClick={() => askApprove(delegate)}>
              {busy === 'approve' ? '正在批准…' : state.error ? '再试一次' : '批准这一次'}
            </Button>
          </div>
          <label className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              className="h-3.5 w-3.5 accent-primary"
              checked={delegate}
              disabled={busy !== null}
              onChange={(event) => setDelegate(event.target.checked)}
            />
            以后这类交给 LinX 判断（授权）
          </label>
        </>
      )}
      <ConfirmDialog
        open={confirming === 'delegate'}
        onOpenChange={(open) => { if (!open) setConfirming(null) }}
        title={`以后“${question}”都交给 LinX 判断？`}
        description="这类事涉及对外发送、花钱或删除。授权后 LinX 会按把握留出等待时间，到点没人处理就替你批准。你随时可以在 文件 › LinX 助手 › 授权 里收回。"
        confirmLabel="确认授权"
        busy={busy !== null}
        onConfirm={() => { setConfirming(null); decide(true) }}
      />
    </CardShell>
  )
}

/** 自动判断 (W2b ⑬): the countdown to LinX approving on the person's behalf. */
function AutoJudgeBody({ item, question, onReask }: { item: InboxItem; question: string; onReask?: (title: string) => void }) {
  const actions = useDecisionActions()
  const { state, run } = useActionState()
  const approval = item.approval!
  const auto = readAutoJudge(approval)
  const now = useNow(30_000, Boolean(auto))
  if (!auto) return <OutcomeLine item={item} resolvedHere={state.resolvedHere} onReask={onReask} />
  const remaining = auto.decideAt.getTime() - now
  const busy = state.busy
  return (
    <CardShell label="自动判断" icon={<Timer className="h-4 w-4" />}>
      <p className="font-medium">{question}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">
        你授权过这类事。把握{CONFIDENCE_LABEL[auto.confidence]}，{formatRemaining(remaining)}后自动批准
      </p>
      {state.error ? <p role="alert" className="mt-2 text-xs text-destructive">{state.error}</p> : null}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button size="sm" variant="ghost" disabled={busy !== null} onClick={() => void run('takeover', () => actions.takeOver(approval))}>
          {busy === 'takeover' ? '正在改…' : '我来判断'}
        </Button>
        <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => void run('reject', () => actions.reject(approval))}>拒绝</Button>
        <Button size="sm" disabled={busy !== null} onClick={() => void run('approve', () => actions.approve({ approval, question }))}>
          {busy === 'approve' ? '正在批准…' : '现在批准'}
        </Button>
      </div>
    </CardShell>
  )
}

/** 回答 (W2): pick or write the answer; it goes back to the same run. */
export function InputCard(props: DecisionCardProps) {
  const lookup = useDecisionItem(props.uri)
  if (lookup.state === 'loading') return <Loading label="回答" />
  if (lookup.state === 'missing') return <CardUnavailable label="回答" reason={MISSING} />
  return <InputBody {...props} item={lookup.item} />
}

export function InputBody({ item, onReask, onInterject }: DecisionCardProps & { item: InboxItem }) {
  const actions = useDecisionActions()
  const { state, run } = useActionState()
  const [answer, setAnswer] = useState('')
  const [deferred, setDeferred] = useState(false)
  const request = item.inputRequest
  if (!request) return <CardUnavailable label="回答" reason={MISSING} />
  const question = titleOf(item, '需要你补充一点信息')
  if (!isActionableInboxItem(item)) {
    return <OutcomeLine item={item} resolvedHere={state.resolvedHere} onReask={onReask} />
  }
  if (deferred) {
    return (
      <button
        type="button"
        onClick={() => setDeferred(false)}
        className="flex w-full max-w-[440px] items-center justify-between gap-3 rounded-lg border border-border bg-card px-3 py-2 text-left text-xs text-muted-foreground hover:bg-muted/40"
      >
        <span className="truncate">稍后处理：<span className="text-foreground">{question}</span></span>
        <span className="shrink-0 text-primary">展开</span>
      </button>
    )
  }
  const options = parseInputRequestOptions(request.inputOptions)
  const secret = isSecretInputRequest(request.requestKind)
  const busy = state.busy
  return (
    <CardShell label="回答" icon={<MessageCircleQuestion className="h-4 w-4" />}>
      <p className="font-medium">{question}</p>
      {request.context ? <p className="mt-0.5 whitespace-pre-wrap text-xs text-muted-foreground">{request.context}</p> : null}
      {secret ? <p className="mt-0.5 text-xs text-muted-foreground">不会出现在聊天记录里</p> : null}
      <div className="mt-2 space-y-2">
        {options.length > 0 ? (
          <div role="radiogroup" aria-label={question} className="flex flex-wrap gap-1.5">
            {options.map((option) => (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={answer === option.value}
                onClick={() => setAnswer(option.value)}
                className={cn(
                  'rounded-md border px-2.5 py-1 text-xs',
                  answer === option.value ? 'border-primary text-primary' : 'border-border text-foreground hover:bg-muted/50',
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        ) : null}
        {secret ? (
          <input
            type="password"
            autoComplete="off"
            aria-label={question}
            value={answer}
            onChange={(event) => setAnswer(event.target.value)}
            className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm"
          />
        ) : (
          <Textarea
            rows={2}
            aria-label={options.length > 0 ? '其他回答' : question}
            placeholder={options.length > 0 ? '其他…' : '写下你的回答'}
            value={answer}
            onChange={(event) => setAnswer(event.target.value)}
            className="min-h-0 resize-none text-sm"
          />
        )}
      </div>
      {state.error ? <p role="alert" className="mt-2 text-xs text-destructive">{state.error}</p> : null}
      <div className="mt-3 flex items-center gap-2">
        <Button size="sm" variant="ghost" disabled={busy !== null} onClick={() => setDeferred(true)}>稍后</Button>
        {onInterject && !secret ? (
          <Button size="sm" variant="ghost" disabled={busy !== null || !answer.trim()} onClick={() => onInterject(answer.trim())}>立即插话</Button>
        ) : null}
        <Button size="sm" disabled={busy !== null || !answer.trim()} onClick={() => void run('answer', () => actions.answer(request, answer.trim()))}>
          {busy === 'answer' ? '正在提交…' : state.error ? '再试一次' : '提交'}
        </Button>
      </div>
    </CardShell>
  )
}

/** 登录 (W2b ⑫): sign in elsewhere, and the run carries on when you are back. */
export function LoginCard(props: DecisionCardProps) {
  const lookup = useDecisionItem(props.uri)
  if (lookup.state === 'loading') return <Loading label="登录" />
  if (lookup.state === 'missing') return <CardUnavailable label="登录" reason={MISSING} />
  return <LoginBody {...props} item={lookup.item} />
}

export function LoginBody({ item, onReask }: DecisionCardProps & { item: InboxItem }) {
  const actions = useDecisionActions()
  const { state, run } = useActionState()
  const [deferred, setDeferred] = useState(false)
  const title = titleOf(item, '需要登录外部服务')
  if (!isActionableInboxItem(item)) return <OutcomeLine item={item} resolvedHere={state.resolvedHere} onReask={onReask} />
  const request = item.inputRequest
  const authUrl = item.authUrl
  if (deferred) {
    return (
      <button type="button" onClick={() => setDeferred(false)} className="rounded-lg border border-border bg-card px-3 py-2 text-xs text-muted-foreground">
        稍后处理：<span className="text-foreground">{title}</span> <span className="text-primary">展开</span>
      </button>
    )
  }
  return (
    <CardShell label="登录" icon={<LockKeyhole className="h-4 w-4" />}>
      <p className="font-medium">{title}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">登录后自动回到这里继续</p>
      {state.error ? <p role="alert" className="mt-2 text-xs text-destructive">{state.error}</p> : null}
      <div className="mt-3 flex items-center gap-2">
        <Button size="sm" variant="ghost" onClick={() => setDeferred(true)}>稍后</Button>
        {authUrl ? (
          <Button size="sm" onClick={() => window.open(authUrl, '_blank', 'noopener,noreferrer')}>
            去登录 <ExternalLink className="ml-1 h-3 w-3" aria-hidden="true" />
          </Button>
        ) : null}
        {request ? (
          <Button size="sm" variant="outline" disabled={state.busy !== null} onClick={() => void run('done', () => actions.answer(request, '已登录'))}>
            {state.busy === 'done' ? '正在确认…' : '我已登录'}
          </Button>
        ) : null}
      </div>
    </CardShell>
  )
}
