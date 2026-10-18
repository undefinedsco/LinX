import { useMemo, useState } from 'react'
import { FileText, Image as ImageIcon } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { projectChatAssets } from '../domain/chat-asset-library'
import {
  filterHistoryAssets,
  searchHistoryText,
  snippetAround,
  type HistoryAsset,
  type HistoryMessage,
  type HistoryTab,
} from '../domain/history-search'
import { formatListTime } from '../domain/list-time'

export interface ChatHistorySearchDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  messages: Array<HistoryMessage & { thread?: string | null; chat?: string | null; richContent?: string | null }>
  podBaseUrl: string | null
  onOpenAsset: (asset: HistoryAsset) => void
}

export function ChatHistorySearchDialog({ open, onOpenChange, messages, podBaseUrl, onOpenAsset }: ChatHistorySearchDialogProps) {
  const [query, setQuery] = useState('')
  const [tab, setTab] = useState<HistoryTab>('all')

  const assets = useMemo<HistoryAsset[]>(
    () => (podBaseUrl ? projectChatAssets(messages, podBaseUrl) : []).map((asset) => ({
      id: asset.id,
      name: asset.name,
      type: asset.type === 'image' ? 'image' : 'file',
      messageId: asset.messageId,
      url: asset.pod_url,
    })),
    [messages, podBaseUrl],
  )
  const textHits = useMemo(() => (tab === 'all' ? searchHistoryText(messages, query) : []), [messages, query, tab])
  const assetHits = useMemo(
    () => (tab === 'all' ? [] : filterHistoryAssets(assets, tab, query)),
    [assets, query, tab],
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>查找聊天记录</DialogTitle>
          <DialogDescription>在这个聊天里找消息、文件和图片。</DialogDescription>
        </DialogHeader>
        <Input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索" aria-label="搜索聊天记录" />
        <Tabs value={tab} onValueChange={(value) => setTab(value as HistoryTab)}>
          <TabsList>
            <TabsTrigger value="all">全部</TabsTrigger>
            <TabsTrigger value="file">文件</TabsTrigger>
            <TabsTrigger value="image">图片</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="max-h-72 overflow-y-auto" role="list" aria-label="查找结果">
          {tab === 'all' && !query.trim() ? (
            <p className="py-8 text-center text-sm text-muted-foreground">输入关键词开始查找</p>
          ) : tab === 'all' ? (
            textHits.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">没有找到“{query.trim()}”</p>
            ) : textHits.map((message) => (
              <div key={message.id} role="listitem" className="border-b border-border/40 px-1 py-2">
                <p className="text-sm text-foreground">{snippetAround(message.content ?? '', query)}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{formatListTime(message.createdAt)}</p>
              </div>
            ))
          ) : assetHits.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {tab === 'file' ? '还没有文件' : '还没有图片'}
            </p>
          ) : assetHits.map((asset) => (
            <button
              key={asset.id}
              type="button"
              role="listitem"
              className="flex w-full items-center gap-2 border-b border-border/40 px-1 py-2 text-left text-sm hover:bg-muted/40"
              onClick={() => onOpenAsset(asset)}
            >
              {asset.type === 'image' ? <ImageIcon className="h-4 w-4 text-muted-foreground" aria-hidden="true" /> : <FileText className="h-4 w-4 text-muted-foreground" aria-hidden="true" />}
              <span className="min-w-0 flex-1 truncate">{asset.name}</span>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
