import { useCallback, useEffect, useMemo, useState } from 'react'
import { Check, Copy, Download, Link2, LoaderCircle, Printer, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  renderConversationHtml,
  renderConversationMarkdown,
  safeConversationFileName,
  type ConversationExportMessage,
} from '../domain/conversation-export'
import {
  createConversationShare,
  listConversationShares,
  revokeConversationShare,
  type ConversationShareRecord,
} from '../services/conversation-share'

export interface ConversationShareDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  threadUri: string
  db: import('@undefineds.co/models').SolidDatabase
  ownerWebId: string
  podBaseUrl: string
  authFetch: typeof fetch
  messages: ConversationExportMessage[]
}

function downloadText(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = name
  anchor.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 0)
}

export function ConversationShareDialog(props: ConversationShareDialogProps) {
  const [includeToolDetails, setIncludeToolDetails] = useState(false)
  const [excludedMessageIds, setExcludedMessageIds] = useState<Set<string>>(() => new Set())
  const [shares, setShares] = useState<ConversationShareRecord[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copiedShareId, setCopiedShareId] = useState<string | null>(null)
  const exportOptions = useMemo(() => ({ title: props.title, includeToolDetails, excludedMessageIds }), [excludedMessageIds, includeToolDetails, props.title])
  const visibleMessages = props.messages.filter((message) => message.role === 'user' || message.role === 'assistant')
  const includedMessageCount = visibleMessages.filter((message, index) => (
    !excludedMessageIds.has(message.id ?? `message-${index}`)
  )).length

  const refreshShares = useCallback(async () => {
    setError(null)
    try {
      setShares(await listConversationShares({ db: props.db, threadUri: props.threadUri }))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '分享记录读取失败。')
    }
  }, [props.db, props.threadUri])

  useEffect(() => {
    if (props.open) void refreshShares()
  }, [props.open, refreshShares])

  useEffect(() => {
    setExcludedMessageIds(new Set())
    setCopiedShareId(null)
    setError(null)
  }, [props.threadUri])

  const createShare = async () => {
    setBusy(true)
    setError(null)
    try {
      const share = await createConversationShare({
        authFetch: props.authFetch,
        db: props.db,
        podBaseUrl: props.podBaseUrl,
        ownerWebId: props.ownerWebId,
        threadUri: props.threadUri,
        messages: props.messages,
        options: exportOptions,
      })
      setShares((current) => [share, ...current])
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '创建分享失败。')
    } finally {
      setBusy(false)
    }
  }

  const printPdf = () => {
    const printWindow = window.open('', '_blank')
    if (!printWindow) {
      setError('浏览器阻止了打印窗口，请允许弹窗后重试。')
      return
    }
    printWindow.opener = null
    printWindow.document.open()
    printWindow.document.write(renderConversationHtml(props.messages, exportOptions))
    printWindow.document.close()
    printWindow.addEventListener('load', () => printWindow.print(), { once: true })
  }

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="flex max-h-[88vh] max-w-3xl flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>分享与导出</DialogTitle>
          <DialogDescription>默认只包含可见对话文本。可排除单条消息；工具结构化详情必须手动启用，敏感字段仍会自动脱敏。</DialogDescription>
        </DialogHeader>
        <div className="grid min-h-0 flex-1 gap-4 md:grid-cols-[minmax(0,1fr)_260px]">
          <section className="min-h-0">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-medium">包含的消息</h3>
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <input type="checkbox" checked={includeToolDetails} onChange={(event) => setIncludeToolDetails(event.target.checked)} />
                包含工具详情
              </label>
            </div>
            <ScrollArea className="h-72 rounded-lg border">
              <div className="divide-y">
                {visibleMessages.map((message, index) => {
                  const id = message.id ?? `message-${index}`
                  const included = !excludedMessageIds.has(id)
                  return (
                    <label key={id} className="flex cursor-pointer gap-3 p-3 text-sm hover:bg-muted/40">
                      <input type="checkbox" checked={included} onChange={() => setExcludedMessageIds((current) => {
                        const next = new Set(current)
                        if (included) next.add(id); else next.delete(id)
                        return next
                      })} />
                      <span className="min-w-0">
                        <span className="block text-xs font-medium">{message.role === 'user' ? '用户' : 'LinX'}</span>
                        <span className="line-clamp-2 text-xs text-muted-foreground">{message.content || '（无文本内容）'}</span>
                      </span>
                    </label>
                  )
                })}
              </div>
            </ScrollArea>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => downloadText(`${safeConversationFileName(props.title)}.md`, renderConversationMarkdown(props.messages, exportOptions), 'text/markdown;charset=utf-8')}><Download className="size-3.5" />Markdown</Button>
              <Button variant="outline" size="sm" className="gap-1.5" onClick={printPdf}><Printer className="size-3.5" />打印 / PDF</Button>
              <Button size="sm" className="gap-1.5" disabled={busy || includedMessageCount === 0} onClick={() => void createShare()}>{busy ? <LoaderCircle className="size-3.5 animate-spin" /> : <Link2 className="size-3.5" />}创建只读分享</Button>
            </div>
            {error ? <p role="alert" className="mt-3 text-sm text-destructive">{error}</p> : null}
          </section>
          <section className="min-h-0 border-l pl-4 max-md:border-l-0 max-md:border-t max-md:pl-0 max-md:pt-4">
            <h3 className="mb-2 text-sm font-medium">有效分享</h3>
            <ScrollArea className="h-72">
              {shares.length === 0 ? <p className="py-8 text-center text-xs text-muted-foreground">暂无公开分享</p> : (
                <div className="space-y-2">
                  {shares.map((share) => (
                    <div key={share.id} className="rounded-lg border p-2">
                      <p className="truncate text-xs" title={share.url}>{share.url}</p>
                      <p className="mt-1 text-[10px] text-muted-foreground">{new Date(share.createdAt).toLocaleString()}</p>
                      <div className="mt-2 flex gap-1">
                        <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs" onClick={async () => {
                          await navigator.clipboard.writeText(share.url)
                          setCopiedShareId(share.id)
                        }}>{copiedShareId === share.id ? <Check className="size-3" /> : <Copy className="size-3" />}复制</Button>
                        <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs text-destructive" onClick={async () => {
                          setBusy(true)
                          try {
                            await revokeConversationShare({ db: props.db, authFetch: props.authFetch, podBaseUrl: props.podBaseUrl, share })
                            setShares((current) => current.filter((entry) => entry.id !== share.id))
                          } catch (reason) {
                            setError(reason instanceof Error ? reason.message : '撤销分享失败。')
                          } finally {
                            setBusy(false)
                          }
                        }}><Trash2 className="size-3" />撤销</Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  )
}
