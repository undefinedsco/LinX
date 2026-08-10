import { useEffect, useMemo, useState } from 'react'
import { Check, Copy, Download, FileText, LoaderCircle, Pencil, RotateCcw, Save, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import type { ChatArtifactVersion } from '@/modules/files/domain/list/chat-files-projection'
import { MarkdownRenderer } from './Markdown/MarkdownRenderer'

interface ArtifactPreview {
  kind: 'image' | 'pdf' | 'markdown' | 'text' | 'binary'
  content?: string
  objectUrl?: string
}

export interface ArtifactWorkspaceProps {
  versions: ChatArtifactVersion[]
  authFetch: typeof fetch
  onContinue: (version: ChatArtifactVersion) => Promise<void> | void
  onSaveVersion: (version: ChatArtifactVersion, content: string) => Promise<void>
}

const MAX_TEXT_PREVIEW_BYTES = 5 * 1024 * 1024

function previewKind(mimeType: string | null, name: string): ArtifactPreview['kind'] {
  const mime = mimeType?.toLowerCase() ?? ''
  const lowerName = name.toLowerCase()
  if (mime.startsWith('image/')) return 'image'
  if (mime === 'application/pdf' || lowerName.endsWith('.pdf')) return 'pdf'
  if (mime.includes('markdown') || /\.(?:md|markdown)$/u.test(lowerName)) return 'markdown'
  if (mime.startsWith('text/') || mime.includes('json') || mime.includes('xml') || /\.(?:txt|json|js|jsx|ts|tsx|css|html|xml|yaml|yml|py|sh|sql)$/u.test(lowerName)) return 'text'
  return 'binary'
}

async function readPreview(version: ChatArtifactVersion, authFetch: typeof fetch): Promise<ArtifactPreview> {
  const response = await authFetch(version.uri)
  if (!response.ok) throw new Error(`Artifact read failed with HTTP ${response.status}`)
  const blob = await response.blob()
  const kind = previewKind(version.mimeType ?? blob.type, version.name)
  if (kind === 'image' || kind === 'pdf') return { kind, objectUrl: URL.createObjectURL(blob) }
  if (kind === 'binary') return { kind }
  if (blob.size > MAX_TEXT_PREVIEW_BYTES) throw new Error('产物超过 5 MB，请下载后查看。')
  return { kind, content: await blob.text() }
}

export function ArtifactWorkspace({ versions, authFetch, onContinue, onSaveVersion }: ArtifactWorkspaceProps) {
  const [selectedId, setSelectedId] = useState(versions[0]?.versionId ?? null)
  const [preview, setPreview] = useState<ArtifactPreview | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const selected = versions.find((version) => version.versionId === selectedId) ?? versions[0] ?? null
  const groups = useMemo(() => {
    const byName = new Map<string, ChatArtifactVersion[]>()
    for (const version of versions) byName.set(version.name, [...(byName.get(version.name) ?? []), version])
    return [...byName.entries()]
  }, [versions])

  useEffect(() => {
    if (!selected) return
    let disposed = false
    let objectUrl: string | undefined
    setLoading(true)
    setError(null)
    setPreview(null)
    setEditing(false)
    setDraft('')
    void readPreview(selected, authFetch).then(
      (nextPreview) => {
        objectUrl = nextPreview.objectUrl
        if (!disposed) setPreview(nextPreview)
      },
      (reason) => {
        if (!disposed) setError(reason instanceof Error ? reason.message : '产物读取失败。')
      },
    ).finally(() => {
      if (!disposed) setLoading(false)
    })
    return () => {
      disposed = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [authFetch, selected])

  useEffect(() => {
    if (preview?.content !== undefined && !editing) setDraft(preview.content)
  }, [editing, preview?.content])

  const download = async () => {
    if (!selected) return
    const response = await authFetch(selected.uri)
    if (!response.ok) throw new Error(`Artifact download failed with HTTP ${response.status}`)
    const objectUrl = URL.createObjectURL(await response.blob())
    const anchor = document.createElement('a')
    anchor.href = objectUrl
    anchor.download = selected.name
    anchor.click()
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0)
  }

  const copy = async () => {
    const content = preview?.content
    if (!content) return
    await navigator.clipboard.writeText(content)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1200)
  }

  const saveVersion = async () => {
    if (!selected || preview?.content === undefined || draft === preview.content) return
    setSaving(true)
    setError(null)
    try {
      await onSaveVersion(selected, draft)
      setEditing(false)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '产物版本保存失败。')
    } finally {
      setSaving(false)
    }
  }

  if (!selected) return <div className="flex h-full items-center justify-center text-sm text-muted-foreground">当前话题还没有运行产物。</div>

  return (
    <div className="grid min-h-0 flex-1 grid-cols-[240px_minmax(0,1fr)] overflow-hidden max-md:grid-cols-1">
      <ScrollArea className="border-r max-md:max-h-48 max-md:border-b max-md:border-r-0">
        <div className="space-y-4 p-3">
          {groups.map(([name, group]) => (
            <section key={name}>
              <p className="mb-1 truncate text-xs font-medium" title={name}>{name}</p>
              <div className="space-y-1">
                {group.map((version, index) => (
                  <button key={version.versionId} type="button" onClick={() => setSelectedId(version.versionId)}
                    className={cn('flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-xs', version.versionId === selected.versionId ? 'bg-accent text-accent-foreground' : 'hover:bg-muted/60')}>
                    <FileText className="size-4 shrink-0" />
                    <span className="min-w-0 flex-1 truncate">版本 {group.length - index}</span>
                    <span className="text-[10px] text-muted-foreground">{version.createdAt ? new Date(version.createdAt).toLocaleTimeString() : ''}</span>
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
      </ScrollArea>
      <div className="flex min-h-0 min-w-0 flex-col">
        <div className="flex min-h-12 items-center gap-2 border-b px-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{selected.name}</p>
            <p className="truncate text-[11px] text-muted-foreground">{selected.uri}</p>
          </div>
          {preview?.content ? <Button variant="ghost" size="icon" onClick={() => void copy()} aria-label="复制产物内容">{copied ? <Check className="size-4" /> : <Copy className="size-4" />}</Button> : null}
          {preview?.content !== undefined && !editing ? <Button variant="ghost" size="icon" onClick={() => setEditing(true)} aria-label="编辑产物"><Pencil className="size-4" /></Button> : null}
          {editing ? (
            <>
              <Button variant="ghost" size="icon" disabled={saving} onClick={() => { setDraft(preview?.content ?? ''); setEditing(false) }} aria-label="取消编辑"><X className="size-4" /></Button>
              <Button variant="default" size="sm" className="gap-1.5" disabled={saving || draft === preview?.content} onClick={() => void saveVersion()}>{saving ? <LoaderCircle className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}保存新版本</Button>
            </>
          ) : null}
          <Button variant="ghost" size="icon" onClick={() => void download()} aria-label="下载产物"><Download className="size-4" /></Button>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => void onContinue(selected)}><RotateCcw className="size-3.5" />继续修改</Button>
        </div>
        <ScrollArea className="min-h-0 flex-1">
          <div className="min-h-full p-5">
            {loading ? <div role="status" className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" />正在读取产物…</div> : null}
            {error ? <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{error}</div> : null}
            {editing ? <Textarea aria-label="产物编辑器" value={draft} onChange={(event) => setDraft(event.target.value)} className="min-h-[58vh] resize-none font-mono text-sm" /> : null}
            {!editing && preview?.kind === 'markdown' ? <MarkdownRenderer content={preview.content ?? ''} /> : null}
            {!editing && preview?.kind === 'text' ? <pre className="whitespace-pre-wrap break-words font-mono text-sm">{preview.content}</pre> : null}
            {preview?.kind === 'image' && preview.objectUrl ? <img src={preview.objectUrl} alt={selected.name} className="mx-auto max-h-[65vh] max-w-full object-contain" /> : null}
            {preview?.kind === 'pdf' && preview.objectUrl ? <iframe title={selected.name} src={preview.objectUrl} className="h-[65vh] w-full rounded-md border" /> : null}
            {preview?.kind === 'binary' ? <div className="py-16 text-center text-sm text-muted-foreground">此文件类型不支持在线预览，请下载后查看。</div> : null}
          </div>
        </ScrollArea>
      </div>
    </div>
  )
}
