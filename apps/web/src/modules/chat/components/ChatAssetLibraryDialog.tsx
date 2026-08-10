import { useEffect, useMemo, useState } from 'react'
import { Download, File, FileImage, LoaderCircle, Paperclip, Plus, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import type { ChatAsset } from '../domain/chat-asset-library'

export interface ChatAssetLibraryDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  assets: ChatAsset[]
  authFetch: typeof fetch
  onReuse: (asset: ChatAsset) => Promise<void>
}

function formatBytes(value: number | undefined): string {
  if (!value || value < 1024) return value ? `${value} B` : ''
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`
  return `${(value / 1024 / 1024).toFixed(1)} MB`
}

export function ChatAssetLibraryDialog(props: ChatAssetLibraryDialogProps) {
  const [search, setSearch] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const assets = useMemo(() => {
    const term = search.trim().toLocaleLowerCase()
    return term
      ? props.assets.filter((asset) => [asset.name, asset.mime_type].some((value) => value.toLocaleLowerCase().includes(term)))
      : props.assets
  }, [props.assets, search])

  useEffect(() => {
    if (!props.open) {
      setSearch('')
      setError(null)
      setBusyId(null)
    }
  }, [props.open])

  const download = async (asset: ChatAsset) => {
    setBusyId(asset.id)
    setError(null)
    try {
      const response = await props.authFetch(asset.pod_url)
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const objectUrl = URL.createObjectURL(await response.blob())
      const anchor = document.createElement('a')
      anchor.href = objectUrl
      anchor.download = asset.name
      anchor.click()
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0)
    } catch (reason) {
      setError(reason instanceof Error ? `资产下载失败：${reason.message}` : '资产下载失败。')
    } finally {
      setBusyId(null)
    }
  }

  const reuse = async (asset: ChatAsset) => {
    setBusyId(asset.id)
    setError(null)
    try {
      await props.onReuse(asset)
      props.onOpenChange(false)
    } catch (reason) {
      setError(reason instanceof Error ? `资产添加失败：${reason.message}` : '资产添加失败。')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="flex h-[min(82vh,760px)] max-w-4xl flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>会话资产</DialogTitle>
          <DialogDescription>浏览当前 Pod 中由聊天产生或上传的附件，并把同一份资源复用到当前会话。</DialogDescription>
        </DialogHeader>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索文件名或类型" className="pl-9" aria-label="搜索会话资产" />
        </div>
        {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
        <ScrollArea className="min-h-0 flex-1 rounded-lg border">
          {assets.length === 0 ? (
            <div className="flex min-h-56 flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
              <Paperclip className="size-8 opacity-50" />{search ? '没有匹配的资产' : '还没有聊天资产'}
            </div>
          ) : (
            <div className="grid gap-2 p-3 sm:grid-cols-2">
              {assets.map((asset) => {
                const Icon = asset.type === 'image' ? FileImage : File
                const busy = busyId === asset.id
                return (
                  <article key={asset.id} className="flex min-w-0 items-center gap-3 rounded-lg border bg-muted/10 p-3">
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted"><Icon className="size-5 text-muted-foreground" /></div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium" title={asset.name}>{asset.name}</p>
                      <p className="truncate text-xs text-muted-foreground">{[asset.mime_type, formatBytes((asset as ChatAsset & { size?: number }).size), asset.createdAt ? new Date(asset.createdAt).toLocaleDateString() : ''].filter(Boolean).join(' · ')}</p>
                    </div>
                    <Button type="button" variant="ghost" size="icon" className="shrink-0" disabled={busy} onClick={() => void download(asset)} aria-label={`下载 ${asset.name}`}>
                      {busy ? <LoaderCircle className="size-4 animate-spin" /> : <Download className="size-4" />}
                    </Button>
                    <Button type="button" variant="outline" size="sm" className="shrink-0 gap-1" disabled={busy} onClick={() => void reuse(asset)} aria-label={`添加 ${asset.name} 到输入框`}>
                      {busy ? <LoaderCircle className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}添加
                    </Button>
                  </article>
                )
              })}
            </div>
          )}
        </ScrollArea>
        <p className="text-xs text-muted-foreground">共 {props.assets.length} 个资产。复用不会重新上传或复制二进制内容。</p>
      </DialogContent>
    </Dialog>
  )
}
