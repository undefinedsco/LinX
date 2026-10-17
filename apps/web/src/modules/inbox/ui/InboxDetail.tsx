import { CheckCircle2, ExternalLink, KeyRound, MessageSquareText } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Textarea } from '@/components/ui/textarea'
import { formatLoginErrorForUser } from '@/modules/login/error-messages'
import type { InboxItem } from '../domain/inbox-item'
import type { InputRequestOption } from '../domain/input-request'
import type { AuditPresentation } from '../domain/presentation'

/** What the detail shows when LinX is waiting to approve, or already did. */
export type InboxAutoDetail =
  | { kind: 'waiting'; remainingLabel: string; confidenceLabel: string }
  | {
      kind: 'approved'
      confidenceLabel: string
      grantTitle: string | null
      grantDate: string | null
      grantRevoked: boolean
      decidedAt: string
      reviewed: boolean
      canRevoke: boolean
    }

export interface InboxInputRequestForm {
  prompt: string
  context: string | null
  options: InputRequestOption[]
  secret: boolean
  canSteer?: boolean
  response: string | null
}

/** A file or folder name instead of the raw resource address. */
function readableTargetName(target: string | null | undefined): string {
  if (!target) return '—'
  try {
    const url = new URL(target)
    const segments = url.pathname.split('/').filter(Boolean)
    const name = segments[segments.length - 1] ?? url.host
    return decodeURIComponent(url.hash ? `${name} · ${url.hash.slice(1)}` : name)
  } catch {
    return target
  }
}

function badgeLabel(item: InboxItem): string {
  if (item.kind === 'approval') return '授权请求'
  if (item.kind === 'input_request') return '需要输入'
  if (item.category === 'auth_required') return '认证请求'
  return '审计事件'
}

/** W7b: why this request can no longer be answered here. */
export type InboxRequestState =
  | { kind: 'expired' }
  | { kind: 'elsewhere'; title: string; timeLabel: string | null }

export interface InboxDetailProps {
  selectedItem: InboxItem
  /** No network: decisions wait until it is back. */
  offline?: boolean
  requestState?: InboxRequestState | null
  reason: string
  setReason: (v: string) => void
  isPendingApproval: boolean
  isPendingAuthRequired: boolean
  isResolvedAuthRequired: boolean
  isPendingInputRequest?: boolean
  inputRequestForm?: InboxInputRequestForm | null
  inputAnswer?: string
  setInputAnswer?: (value: string) => void
  handleSubmitInput?: (mode?: 'queue' | 'steer') => void
  steerError?: string | null
  isMutating: boolean
  approvalMeta: { createdAt: string; resolvedAt: string } | null
  auditPresentation: AuditPresentation | null
  auditTime: string | null
  statusLabel: string | null
  error: Error | null
  handleResolve: (decision: 'approved' | 'rejected') => void
  grantChecked?: boolean
  setGrantChecked?: (value: boolean) => void
  /** 花钱 / 删除 / 对外发送 when the request is one of those. */
  impactLabel?: string | null
  confirmGrantOpen?: boolean
  setConfirmGrantOpen?: (open: boolean) => void
  handleConfirmGrant?: () => void
  autoDetail?: InboxAutoDetail | null
  handleTakeOver?: () => void
  handleMarkReviewed?: () => void
  handleRevokeGrant?: () => void
  handleOpenConversation: () => void
  formatAuditActorRole: (role?: string) => string
}

export function InboxDetail({
  selectedItem,
  offline = false,
  requestState = null,
  reason,
  setReason,
  isPendingApproval,
  isPendingAuthRequired,
  isResolvedAuthRequired,
  isPendingInputRequest = false,
  inputRequestForm = null,
  inputAnswer = '',
  setInputAnswer,
  handleSubmitInput,
  steerError = null,
  isMutating,
  approvalMeta,
  auditPresentation,
  auditTime,
  statusLabel,
  error,
  handleResolve,
  grantChecked = false,
  setGrantChecked,
  impactLabel = null,
  confirmGrantOpen = false,
  setConfirmGrantOpen,
  handleConfirmGrant,
  autoDetail = null,
  handleTakeOver,
  handleMarkReviewed,
  handleRevokeGrant,
  handleOpenConversation,
  formatAuditActorRole,
}: InboxDetailProps) {
  return (
    <ScrollArea className="h-full">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 p-4">
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className="text-lg">{selectedItem.title}</CardTitle>
              <Badge variant={selectedItem.kind === 'audit' ? 'secondary' : 'default'}>
                {badgeLabel(selectedItem)}
              </Badge>
              {statusLabel && <Badge variant="outline">{statusLabel}</Badge>}
            </div>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            {offline && (
              <p role="status" className="rounded-xl border border-border/50 bg-muted/30 px-4 py-2.5 text-sm text-muted-foreground">
                没有网络，恢复后才能处理
              </p>
            )}
            {requestState?.kind === 'expired' && (
              <div role="status" className="rounded-xl border border-border/50 bg-muted/30 p-4">
                <p className="text-sm font-medium text-foreground">这个请求已经过期</p>
                <p className="mt-1 text-xs text-muted-foreground">助手没有继续做。需要的话在会话里让它重新问你。</p>
              </div>
            )}
            {requestState?.kind === 'elsewhere' && (
              <div role="status" className="space-y-2 rounded-xl border border-border/50 bg-muted/30 p-4">
                <p className="text-sm font-medium text-foreground">正在看的请求在别处被处理了</p>
                <p className="text-xs text-muted-foreground">
                  {requestState.title}{requestState.timeLabel ? ` · ${requestState.timeLabel}` : ''}
                </p>
                {selectedItem.chatId && (
                  <Button variant="outline" size="sm" onClick={handleOpenConversation}>回到会话</Button>
                )}
              </div>
            )}
            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground">摘要</div>
              <p className="mt-1 leading-6 text-foreground">{selectedItem.description}</p>
            </div>

            {(selectedItem.chatId || selectedItem.authUrl) && (
              <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border/50 bg-muted/20 p-4">
                {selectedItem.chatId && (
                  <Button variant="outline" size="sm" onClick={handleOpenConversation}>
                    <MessageSquareText className="mr-1.5 h-4 w-4" />
                    打开会话
                  </Button>
                )}
                {selectedItem.authUrl && (
                  <Button asChild size="sm">
                    <a href={selectedItem.authUrl} target="_blank" rel="noreferrer">
                      <ExternalLink className="mr-1.5 h-4 w-4" />
                      打开认证页
                    </a>
                  </Button>
                )}
              </div>
            )}

            {selectedItem.approval && (
              <div className="grid gap-4 rounded-xl border border-border/50 bg-muted/20 p-4 sm:grid-cols-2">
                <div>
                  <div className="text-xs text-muted-foreground">工具</div>
                  <div className="mt-1 font-medium text-foreground">{selectedItem.approval.toolName}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">风险</div>
                  <div className="mt-1 font-medium text-foreground">{selectedItem.approval.risk}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">创建时间</div>
                  <div className="mt-1 text-foreground">{approvalMeta?.createdAt}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">处理时间</div>
                  <div className="mt-1 text-foreground">{approvalMeta?.resolvedAt}</div>
                </div>
                <div className="sm:col-span-2">
                  <div className="text-xs text-muted-foreground">涉及</div>
                  <div className="mt-1 break-all text-foreground">{readableTargetName(selectedItem.approval.target)}</div>
                </div>
                {selectedItem.approval.reason && (
                  <div className="sm:col-span-2">
                    <div className="text-xs text-muted-foreground">处理备注</div>
                    <div className="mt-1 whitespace-pre-wrap text-foreground">{selectedItem.approval.reason}</div>
                  </div>
                )}
              </div>
            )}

            {autoDetail?.kind === 'waiting' && (
              <div className="space-y-2 rounded-xl border border-primary/20 bg-primary/5 p-4">
                <p className="text-sm font-medium text-foreground">LinX 会在 {autoDetail.remainingLabel} 自动通过</p>
                <p className="text-xs text-muted-foreground">{autoDetail.confidenceLabel}，你之前授权过这类事。你可以提前决定，或者改成自己来判断。</p>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" onClick={() => void handleResolve('approved')} disabled={isMutating}>现在批准</Button>
                  <Button size="sm" variant="outline" onClick={() => void handleResolve('rejected')} disabled={isMutating}>拒绝</Button>
                  <Button size="sm" variant="outline" onClick={handleTakeOver} disabled={isMutating}>我来判断</Button>
                </div>
              </div>
            )}

            {autoDetail?.kind === 'approved' && (
              <div className="space-y-3 rounded-xl border border-border/50 bg-muted/20 p-4">
                <p className="text-sm font-medium text-foreground">LinX 替你批准 · {autoDetail.decidedAt}</p>
                <div>
                  <div className="text-xs text-muted-foreground">为什么批</div>
                  <p className="mt-1 text-foreground">
                    你授权过：{autoDetail.grantTitle ?? '这类事'}{autoDetail.grantDate ? ` · ${autoDetail.grantDate}` : ''}
                    {autoDetail.grantRevoked ? '（已收回）' : ''}
                  </p>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">怎么过的</div>
                  <p className="mt-1 text-foreground">{autoDetail.confidenceLabel}，等了一阵没人管，自动通过</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" onClick={handleMarkReviewed} disabled={isMutating || autoDetail.reviewed}>
                    {autoDetail.reviewed ? '已确认没问题' : '没问题'}
                  </Button>
                  {autoDetail.canRevoke && (
                    <Button size="sm" variant="outline" onClick={handleRevokeGrant} disabled={isMutating}>
                      以后这类都问我
                    </Button>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">收回后，这类事回到“等你判断”。已经做了的不会撤回。</p>
              </div>
            )}

            {isPendingApproval && autoDetail?.kind !== 'waiting' && (
              <div className="space-y-3 rounded-xl border border-primary/20 bg-primary/5 p-4">
                <div>
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">处理备注</div>
                  <Textarea
                    aria-label="处理备注"
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                    placeholder="可选：补充批准 / 拒绝原因，便于后续审计。"
                    className="mt-2 min-h-[96px]"
                  />
                </div>
                <label className="flex cursor-pointer items-center gap-2 text-sm text-foreground">
                  <input
                    type="checkbox"
                    checked={grantChecked}
                    onChange={(event) => setGrantChecked?.(event.target.checked)}
                    className="accent-primary"
                  />
                  以后这类交给 LinX 判断（授权）
                </label>
                <div className="flex items-center gap-2">
                  <Button variant="outline" onClick={() => void handleResolve('rejected')} disabled={isMutating}>
                    拒绝
                  </Button>
                  <Button onClick={() => void handleResolve('approved')} disabled={isMutating}>
                    {isMutating ? '处理中...' : '批准这一次'}
                  </Button>
                </div>
                {error && (
                  <p className="text-xs text-destructive">
                    {formatLoginErrorForUser(error, '处理审批失败。请稍后重试。')}
                  </p>
                )}
                <p className="text-xs text-muted-foreground">处理后会话里同步显示。</p>
                <ConfirmDialog
                  open={confirmGrantOpen}
                  onOpenChange={(open) => setConfirmGrantOpen?.(open)}
                  title={`要把“${impactLabel ?? '这类事'}”交给 LinX 判断吗？`}
                  description="以后这类事 LinX 拿得准时会自己通过，等一阵没人管就会做。你可以随时在授权里收回。"
                  confirmLabel="批准并授权"
                  destructive
                  busy={isMutating}
                  onConfirm={() => handleConfirmGrant?.()}
                />
              </div>
            )}

            {inputRequestForm && isPendingInputRequest && (
              <form
                className="space-y-3 rounded-xl border border-primary/20 bg-primary/5 p-4"
                onSubmit={(event) => {
                  event.preventDefault()
                  handleSubmitInput?.('queue')
                }}
              >
                {inputRequestForm.context && (
                  <p className="whitespace-pre-wrap text-xs leading-6 text-muted-foreground">{inputRequestForm.context}</p>
                )}
                {inputRequestForm.options.length > 0 && (
                  <fieldset className="flex flex-wrap gap-2">
                    <legend className="sr-only">{inputRequestForm.prompt}</legend>
                    {inputRequestForm.options.map((option) => (
                      <label
                        key={option.value}
                        className="flex cursor-pointer items-center gap-2 rounded-md border border-border/60 bg-background px-3 py-1.5 text-sm has-[:checked]:border-primary has-[:checked]:text-primary"
                      >
                        <input
                          type="radio"
                          name="inbox-input-option"
                          value={option.value}
                          checked={inputAnswer === option.value}
                          onChange={() => setInputAnswer?.(option.value)}
                          className="accent-primary"
                        />
                        {option.label}
                      </label>
                    ))}
                  </fieldset>
                )}
                <div>
                  <label htmlFor="inbox-input-answer" className="text-xs text-muted-foreground">
                    {inputRequestForm.options.length > 0 ? '或者直接填写' : '你的回答'}
                  </label>
                  {inputRequestForm.secret ? (
                    <input
                      id="inbox-input-answer"
                      type="password"
                      autoComplete="off"
                      value={inputAnswer}
                      onChange={(event) => setInputAnswer?.(event.target.value)}
                      className="mt-2 h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                    />
                  ) : (
                    <Textarea
                      id="inbox-input-answer"
                      value={inputAnswer}
                      onChange={(event) => setInputAnswer?.(event.target.value)}
                      className="mt-2 min-h-[72px]"
                    />
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Button type="submit" disabled={isMutating || !inputAnswer.trim()}>
                    {isMutating ? '提交中...' : '提交'}
                  </Button>
                  {inputRequestForm.canSteer ? (
                    <Button
                      type="button"
                      variant="outline"
                      disabled={isMutating || !inputAnswer.trim()}
                      onClick={() => handleSubmitInput?.('steer')}
                    >
                      立即插话
                    </Button>
                  ) : null}
                  {error && (
                    <span className="text-xs text-destructive">
                      {formatLoginErrorForUser(error, '没有提交成功，你填的内容还在。')}
                    </span>
                  )}
                </div>
                {steerError ? <p className="text-xs text-destructive">{steerError}</p> : null}
                <p className="text-xs text-muted-foreground">
                  {inputRequestForm.secret
                    ? '只会排队交给等待中的运行，不会出现在聊天记录里。'
                    : inputRequestForm.canSteer
                      ? '提交：排队，等它下次来取，不打断正在做的事。立即插话：同时发进原来的聊天，马上交给它。'
                      : '提交后排队交给等待中的那次运行，不会重新开始。'}
                </p>
              </form>
            )}

            {inputRequestForm && !isPendingInputRequest && inputRequestForm.response && (
              <div className="rounded-xl border border-border/50 bg-muted/20 p-4 text-sm">
                <div className="text-xs text-muted-foreground">你的回答</div>
                <div className="mt-1 whitespace-pre-wrap text-foreground">{inputRequestForm.response}</div>
              </div>
            )}

            {isPendingAuthRequired && (
              <div className="rounded-xl border border-boundary/20 bg-boundary/5 p-4">
                <div className="flex items-start gap-3">
                  <KeyRound className="mt-0.5 h-4 w-4 shrink-0 text-boundary" />
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-foreground">运行时等待额外认证</p>
                    <p className="text-xs leading-6 text-muted-foreground">
                      完成认证后，返回会话继续观察运行时输出。认证本身会记入审计流水。
                    </p>
                    {(selectedItem.authMethod || selectedItem.authMessage || selectedItem.authUrl) && (
                      <div className="grid gap-3 text-xs text-foreground sm:grid-cols-2">
                        <div>
                          <div className="text-muted-foreground">认证方式</div>
                          <div className="mt-1">{selectedItem.authMethod || '—'}</div>
                        </div>
                        <div>
                          <div className="text-muted-foreground">认证地址</div>
                          <div className="mt-1 break-all">{selectedItem.authUrl || '—'}</div>
                        </div>
                        {selectedItem.authMessage && (
                          <div className="sm:col-span-2">
                            <div className="text-muted-foreground">说明</div>
                            <div className="mt-1 whitespace-pre-wrap">{selectedItem.authMessage}</div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {isResolvedAuthRequired && (
              <div className="rounded-xl border border-success/20 bg-success/5 p-4">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-foreground">运行时认证已完成</p>
                    <p className="text-xs leading-6 text-muted-foreground">
                      当前认证请求已解除待处理状态。可以返回会话继续观察运行时输出。
                    </p>
                  </div>
                </div>
              </div>
            )}

            {selectedItem.audit && (
              <div className="grid gap-4 rounded-xl border border-border/50 bg-muted/20 p-4 sm:grid-cols-2">
                <div>
                  <div className="text-xs text-muted-foreground">事件</div>
                  <div className="mt-1 font-medium text-foreground">{auditPresentation?.title || selectedItem.title}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">来源</div>
                  <div className="mt-1 font-medium text-foreground">
                    {auditPresentation?.actorRoleLabel || formatAuditActorRole(selectedItem.audit.actorRole)}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">会话</div>
                  <div className="mt-1 break-all text-foreground">{selectedItem.audit.session || '—'}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">时间</div>
                  <div className="mt-1 text-foreground">{auditTime}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">原始动作</div>
                  <div className="mt-1 font-mono text-xs text-foreground">{selectedItem.audit.action}</div>
                </div>
                {statusLabel && (
                  <div>
                    <div className="text-xs text-muted-foreground">状态</div>
                    <div className="mt-1 text-foreground">{statusLabel}</div>
                  </div>
                )}
              </div>
            )}

            {selectedItem.audit?.entry && (
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground">事件详情</div>
                <div className="mt-2 break-all rounded-xl border border-border/50 bg-card/70 p-4 font-mono text-xs leading-6 text-foreground">
                  {selectedItem.audit.entry}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </ScrollArea>
  )
}
