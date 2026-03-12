import { useMemo, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { ExternalLink, KeyRound, MessageSquareText } from 'lucide-react'
import type { MicroAppPaneProps } from '@/modules/layout/micro-app-registry'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Textarea } from '@/components/ui/textarea'
import { useChatStore } from '@/modules/chat/store'
import { useInboxItems, useResolveInboxApproval } from '../collections'
import { useInboxStore } from '../store'

function formatTime(value: string | undefined) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString('zh-CN')
}

function prettyContext(value: string | null | undefined) {
  if (!value) return null
  try {
    return JSON.stringify(JSON.parse(value), null, 2)
  } catch {
    return value
  }
}

export function InboxContentPane(_props: MicroAppPaneProps) {
  const [reason, setReason] = useState('')
  const navigate = useNavigate()
  const selectChat = useChatStore((state) => state.selectChat)
  const selectThread = useChatStore((state) => state.selectThread)
  const selectedItemId = useInboxStore((state) => state.selectedItemId)
  const { data: items = [], isLoading } = useInboxItems()
  const resolveApproval = useResolveInboxApproval()
  const selectedItem = items.find((item) => item.id === selectedItemId) ?? null

  const isPendingApproval = selectedItem?.kind === 'approval' && selectedItem.status === 'pending' && !!selectedItem.approval
  const isAuthRequired = selectedItem?.category === 'auth_required'
  const isMutating = resolveApproval.isPending

  const approvalMeta = useMemo(() => {
    if (!selectedItem?.approval) return null
    return {
      createdAt: formatTime(String(selectedItem.approval.createdAt ?? '')),
      resolvedAt: formatTime(String(selectedItem.approval.resolvedAt ?? '')),
    }
  }, [selectedItem])

  const handleResolve = async (decision: 'approved' | 'rejected') => {
    if (!selectedItem?.approval) return
    await resolveApproval.mutateAsync({
      approval: selectedItem.approval,
      decision,
      reason,
    })
    setReason('')
  }

  const handleOpenConversation = () => {
    if (!selectedItem?.chatId) return
    selectChat(selectedItem.chatId)
    if (selectedItem.threadId) {
      selectThread(selectedItem.threadId)
    }
    navigate({ to: '/$microAppId', params: { microAppId: 'chat' } })
  }

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        正在加载 inbox 详情…
      </div>
    )
  }

  if (!selectedItem) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        选择一条 inbox 事件查看详情。
      </div>
    )
  }

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
              {selectedItem.status && <Badge variant="outline">{selectedItem.status}</Badge>}
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
                {resolveApproval.error && (
                  <p className="text-xs text-destructive">
                    {resolveApproval.error instanceof Error ? resolveApproval.error.message : '处理审批失败'}
                  </p>
                )}
                <p className="text-xs text-muted-foreground">
                  当前已接通 Pod 留档、inbox 审批与 runtime 续跑；这里继续补足查看和跳转体验。
                </p>
              </div>
            )}

            {isAuthRequired && (
              <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-4">
                <div className="flex items-start gap-3">
                  <KeyRound className="mt-0.5 h-4 w-4 shrink-0 text-blue-500" />
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

            {selectedItem.audit && (
              <div className="grid gap-4 rounded-xl border border-border/50 bg-muted/20 p-4 sm:grid-cols-2">
                <div>
                  <div className="text-xs text-muted-foreground">动作</div>
                  <div className="mt-1 font-medium text-foreground">{selectedItem.audit.action}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">角色</div>
                  <div className="mt-1 font-medium text-foreground">{selectedItem.audit.actorRole}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">会话</div>
                  <div className="mt-1 break-all text-foreground">{selectedItem.audit.session || '—'}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">时间</div>
                  <div className="mt-1 text-foreground">{formatTime(String(selectedItem.audit.createdAt ?? ''))}</div>
                </div>
              </div>
            )}

            {selectedItem.audit?.context && (
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground">上下文</div>
                <pre className="mt-2 overflow-x-auto rounded-xl border border-border/50 bg-card/70 p-4 text-xs leading-6 text-foreground">
                  {prettyContext(selectedItem.audit.context)}
                </pre>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </ScrollArea>
  )
}
