import { useState } from 'react'
import { ChevronDown, LockKeyhole, MessageCircleQuestion, ShieldAlert, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { useConversationDecisions, type DecisionCardModel } from './useConversationDecisions'

const ICONS = { approval: ShieldAlert, input: MessageCircleQuestion, login: LockKeyhole } as const

/**
 * Approvals, questions and logins raised in this conversation, answered in
 * place (R6 §3.4: the same decision can be completed where the work is).
 */
export function ConversationDecisions({ chatId, threadId }: { chatId: string; threadId: string }) {
  const decisions = useConversationDecisions(chatId, threadId)
  if (decisions.cards.length === 0) return null

  return (
    <section aria-label="等你处理" className="max-h-[45%] shrink-0 overflow-y-auto border-b border-border bg-layout-content px-4 py-3">
      <div className="mx-auto max-w-3xl space-y-2">
        {decisions.cards.map((card) => (
          <DecisionCard
            key={card.item.id}
            card={card}
            answer={decisions.answers[card.item.id] ?? ''}
            onAnswerChange={(value) => decisions.setAnswer(card.item.id, value)}
            onApprove={() => decisions.approve(card.item, 'approved')}
            onReject={() => decisions.approve(card.item, 'rejected')}
            onSubmitAnswer={() => decisions.answer(card.item)}
            onReask={() => decisions.reask(card.item)}
            onRetry={() => decisions.retry(card.item.id)}
            onCancelError={() => decisions.cancelError(card.item.id)}
            onDefer={() => decisions.defer(card.item.id)}
            onResume={() => decisions.resume(card.item.id)}
            onDismiss={() => decisions.dismiss(card.item.id)}
          />
        ))}
        {decisions.cards.some((card) => card.pending) ? (
          <p className="px-1 text-[11px] text-muted-foreground">关闭页面不会取消这些请求，也可以在收件箱处理。</p>
        ) : null}
      </div>
    </section>
  )
}

interface DecisionCardProps {
  card: DecisionCardModel
  answer: string
  onAnswerChange: (value: string) => void
  onApprove: () => void
  onReject: () => void
  onSubmitAnswer: () => void
  onReask: () => void
  onRetry: () => void
  onCancelError: () => void
  onDefer: () => void
  onResume: () => void
  onDismiss: () => void
}

function DecisionCard(props: DecisionCardProps) {
  const { card } = props
  const [showDetail, setShowDetail] = useState(false)
  const Icon = ICONS[card.kind]

  // Finished: one quiet line saying what happened (and where).
  if (!card.pending) {
    return (
      <div role="status" className="flex items-center justify-between gap-3 rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
        <span className="min-w-0 truncate"><span className="text-foreground">{card.title}</span> · {card.outcomeText}</span>
        <span className="flex shrink-0 items-center gap-2">
          {card.canReask ? (
            <button type="button" className="text-primary hover:underline" disabled={card.busy === 'reask'} onClick={props.onReask}>
              {card.busy === 'reask' ? '正在请它重问…' : '让助手重新问一次'}
            </button>
          ) : null}
          <button type="button" aria-label={`收起：${card.title}`} className="rounded p-0.5 hover:bg-muted" onClick={props.onDismiss}>
            <X className="h-3.5 w-3.5" />
          </button>
        </span>
      </div>
    )
  }

  if (card.deferred) {
    return (
      <button
        type="button"
        onClick={props.onResume}
        className="flex w-full items-center justify-between gap-3 rounded-lg border border-border bg-card px-3 py-2 text-left text-xs text-muted-foreground hover:bg-muted/40"
      >
        <span className="truncate">稍后处理：<span className="text-foreground">{card.title}</span></span>
        <span className="shrink-0 text-primary">展开</span>
      </button>
    )
  }

  const busy = card.busy !== null
  return (
    <div className="rounded-lg border border-primary/25 bg-card p-3 shadow-sm">
      <div className="flex items-start gap-2">
        <Icon className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground">{card.title}</p>
          {card.kind === 'login' ? (
            <p className="mt-0.5 text-xs text-muted-foreground">登录后自动回到这里继续</p>
          ) : card.detail && card.kind === 'approval' ? (
            <button
              type="button"
              className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              aria-expanded={showDetail}
              onClick={() => setShowDetail((value) => !value)}
            >
              详情 <ChevronDown className={cn('h-3 w-3 transition-transform', showDetail && 'rotate-180')} />
            </button>
          ) : card.input?.context ? (
            <p className="mt-0.5 whitespace-pre-wrap text-xs text-muted-foreground">{card.input.context}</p>
          ) : null}
          {showDetail && card.detail ? (
            <p className="mt-1 whitespace-pre-wrap rounded bg-muted/50 px-2 py-1.5 text-xs text-muted-foreground">{card.detail}</p>
          ) : null}
        </div>
      </div>

      {card.input ? (
        <div className="mt-2 space-y-2 pl-6">
          {card.input.options.length > 0 ? (
            <div role="radiogroup" aria-label={card.title} className="flex flex-wrap gap-1.5">
              {card.input.options.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={props.answer === option.value}
                  onClick={() => props.onAnswerChange(option.value)}
                  className={cn(
                    'rounded-md border px-2.5 py-1 text-xs',
                    props.answer === option.value ? 'border-primary text-primary' : 'border-border text-foreground hover:bg-muted/50',
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
          ) : null}
          {card.input.secret ? (
            <>
              <input
                type="password"
                autoComplete="off"
                aria-label="你的回答"
                value={props.answer}
                onChange={(event) => props.onAnswerChange(event.target.value)}
                className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm"
              />
              <p className="text-[11px] text-muted-foreground">不会出现在聊天记录里</p>
            </>
          ) : (
            <Textarea
              aria-label={card.input.options.length > 0 ? '或者直接填写' : '你的回答'}
              placeholder={card.input.options.length > 0 ? '其他…' : '你的回答'}
              value={card.input.options.some((option) => option.value === props.answer) ? '' : props.answer}
              onChange={(event) => props.onAnswerChange(event.target.value)}
              className="min-h-[40px] text-sm"
            />
          )}
        </div>
      ) : null}

      {card.error ? (
        <div role="alert" className="mt-2 flex items-center justify-between gap-2 pl-6 text-xs text-destructive">
          <span>{card.error}</span>
          <span className="flex shrink-0 gap-2">
            <button type="button" className="text-muted-foreground hover:underline" onClick={props.onCancelError}>取消</button>
            <button type="button" className="text-primary hover:underline" onClick={props.onRetry}>再试一次</button>
          </span>
        </div>
      ) : (
        <div className="mt-2 flex justify-end gap-2">
          {card.kind === 'approval' ? (
            <>
              <Button size="sm" variant="outline" className="h-7" disabled={busy} onClick={props.onReject}>
                {card.busy === 'reject' ? '正在拒绝…' : '拒绝'}
              </Button>
              <Button size="sm" className="h-7" disabled={busy} onClick={props.onApprove}>
                {card.busy === 'approve' ? '正在批准…' : '批准'}
              </Button>
            </>
          ) : card.kind === 'input' ? (
            <>
              <Button size="sm" variant="ghost" className="h-7" disabled={busy} onClick={props.onDefer}>稍后</Button>
              <Button size="sm" className="h-7" disabled={busy || !props.answer.trim()} onClick={props.onSubmitAnswer}>
                {card.busy === 'answer' ? '正在提交…' : '提交'}
              </Button>
            </>
          ) : (
            <>
              <Button size="sm" variant="ghost" className="h-7" onClick={props.onDefer}>稍后</Button>
              {card.item.authUrl ? (
                <Button size="sm" className="h-7" asChild>
                  <a href={card.item.authUrl} target="_blank" rel="noreferrer">去登录</a>
                </Button>
              ) : null}
            </>
          )}
        </div>
      )}
    </div>
  )
}
