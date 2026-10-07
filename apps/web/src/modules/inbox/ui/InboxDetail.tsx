import { CheckCircle2, ExternalLink, KeyRound, MessageSquareText } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Textarea } from '@/components/ui/textarea'
import { formatLoginErrorForUser } from '@/modules/login/error-messages'
import type { InboxItem } from '../domain/inbox-item'
import type { AuditPresentation } from '../domain/presentation'

export interface InboxDetailProps {
  selectedItem: InboxItem
  reason: string
  setReason: (v: string) => void
  isPendingApproval: boolean
  isPendingAuthRequired: boolean
  isResolvedAuthRequired: boolean
  isMutating: boolean
  approvalMeta: { createdAt: string; resolvedAt: string } | null
  auditPresentation: AuditPresentation | null
  auditTime: string | null
  statusLabel: string | null
  error: Error | null
  handleResolve: (decision: 'approved' | 'rejected') => void
  handleOpenConversation: () => void
  formatAuditActorRole: (role?: string) => string
}

export function InboxDetail({
  selectedItem,
  reason,
  setReason,
  isPendingApproval,
  isPendingAuthRequired,
  isResolvedAuthRequired,
  isMutating,
  approvalMeta,
  auditPresentation,
  auditTime,
  statusLabel,
  error,
  handleResolve,
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
              <Badge variant={selectedItem.kind === 'approval' ? 'default' : 'secondary'}>
                {selectedItem.kind === 'approval' ? '授权请求' : selectedItem.category === 'auth_required' ? '认证请求' : '审计事件'}
              </Badge>
              {statusLabel && <Badge variant="outline">{statusLabel}</Badge>}
            </div>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
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
                  <div className="text-xs text-muted-foreground">目标</div>
                  <div className="mt-1 break-all text-foreground">{selectedItem.approval.target}</div>
                </div>
                {selectedItem.approval.reason && (
                  <div className="sm:col-span-2">
                    <div className="text-xs text-muted-foreground">处理备注</div>
                    <div className="mt-1 whitespace-pre-wrap text-foreground">{selectedItem.approval.reason}</div>
                  </div>
                )}
              </div>
            )}

            {isPendingApproval && (
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
                <div className="flex items-center gap-2">
                  <Button onClick={() => void handleResolve('approved')} disabled={isMutating}>
                    {isMutating ? '处理中...' : '批准'}
                  </Button>
                  <Button variant="outline" onClick={() => void handleResolve('rejected')} disabled={isMutating}>
                    拒绝
                  </Button>
                </div>
                {error && (
                  <p className="text-xs text-destructive">
                    {formatLoginErrorForUser(error, '处理审批失败。请稍后重试。')}
                  </p>
                )}
                <p className="text-xs text-muted-foreground">
                  审批结果会保存到当前空间；运行时恢复后，相关会话会继续推进。
                </p>
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
