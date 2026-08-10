import { useCallback, useEffect, useState } from 'react'
import { Brain, LoaderCircle, Plus, Save, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  emptyProjectContext,
  readProjectContext,
  writeProjectContext,
  type ChatProjectContext,
} from '../services/project-context'

export interface ProjectContextDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  workspaceUri: string
  db: import('@undefineds.co/models').SolidDatabase
}

export function ProjectContextDialog(props: ProjectContextDialogProps) {
  const [context, setContext] = useState<ChatProjectContext>(() => emptyProjectContext(props.workspaceUri))
  const [memoryDraft, setMemoryDraft] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setContext(await readProjectContext({
        db: props.db,
        workspaceUri: props.workspaceUri,
      }))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '项目上下文读取失败。')
    } finally {
      setLoading(false)
    }
  }, [props.db, props.workspaceUri])

  useEffect(() => {
    if (props.open) void load()
  }, [load, props.open])

  const save = async (next = context) => {
    setSaving(true)
    setError(null)
    try {
      setContext(await writeProjectContext({ db: props.db, context: next }))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '项目上下文保存失败。')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>项目上下文与记忆</DialogTitle>
          <DialogDescription>同一工作区绑定的多个话题共享这些内容。模型每轮使用前都会读取；你可以随时查看、修改或关闭记忆。</DialogDescription>
        </DialogHeader>
        {loading ? <div role="status" className="flex items-center gap-2 py-8 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" />正在读取项目上下文…</div> : (
          <div className="space-y-5">
            <div className="rounded-lg border bg-muted/20 p-3">
              <p className="text-xs font-medium">当前工作区</p>
              <p className="mt-1 break-all text-xs text-muted-foreground">{props.workspaceUri}</p>
            </div>
            <label className="block space-y-2">
              <span className="text-sm font-medium">项目说明</span>
              <Textarea value={context.instructions} onChange={(event) => setContext((current) => ({ ...current, instructions: event.target.value }))} placeholder="例如：回答优先引用项目文件；发布目标为周五。" className="min-h-28" />
            </label>
            <section>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="flex items-center gap-2 text-sm font-medium"><Brain className="size-4" />共享记忆</h3>
                  <p className="text-xs text-muted-foreground">仅保存你明确添加的内容。</p>
                </div>
                <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={context.memoryEnabled} onChange={(event) => setContext((current) => ({ ...current, memoryEnabled: event.target.checked }))} />本轮允许使用</label>
              </div>
              <div className="mt-3 flex gap-2">
                <Input value={memoryDraft} onChange={(event) => setMemoryDraft(event.target.value)} placeholder="添加一条项目记忆" />
                <Button type="button" variant="outline" size="icon" aria-label="添加项目记忆" disabled={!memoryDraft.trim()} onClick={() => {
                  const text = memoryDraft.trim()
                  if (!text) return
                  setContext((current) => ({ ...current, memories: [...current.memories, { id: crypto.randomUUID(), text, createdAt: new Date().toISOString() }] }))
                  setMemoryDraft('')
                }}><Plus className="size-4" /></Button>
              </div>
              <div className="mt-2 max-h-48 space-y-1 overflow-y-auto">
                {context.memories.map((memory) => (
                  <div key={memory.id} className="flex items-start gap-2 rounded-md border px-3 py-2 text-sm">
                    <span className="min-w-0 flex-1 whitespace-pre-wrap">{memory.text}</span>
                    <Button type="button" variant="ghost" size="icon" className="size-7 shrink-0" aria-label="删除项目记忆" onClick={() => setContext((current) => ({ ...current, memories: current.memories.filter((entry) => entry.id !== memory.id) }))}><Trash2 className="size-3.5" /></Button>
                  </div>
                ))}
                {context.memories.length === 0 ? <p className="py-4 text-center text-xs text-muted-foreground">尚未保存项目记忆</p> : null}
              </div>
            </section>
            {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
            <div className="flex justify-end">
              <Button disabled={saving} className="gap-1.5" onClick={() => void save()}>{saving ? <LoaderCircle className="size-4 animate-spin" /> : <Save className="size-4" />}保存上下文</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
