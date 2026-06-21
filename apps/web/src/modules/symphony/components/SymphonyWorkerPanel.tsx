import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useSession } from '@inrupt/solid-ui-react'
import { Bot, ChevronDown, ChevronRight, Loader2, Play, RefreshCw } from 'lucide-react'
import type { SolidDatabase } from '@undefineds.co/models'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Textarea } from '@/components/ui/textarea'
import { useSolidDatabase } from '@/providers/solid-database-provider'
import { cn } from '@/lib/utils'
import { useChatStore } from '@/modules/chat/store'
import { runAndPersistWebSymphonyWorkerGoal, type RunAndPersistWebSymphonyWorkerGoalInput } from '../service'
import { symphonyControlOps } from '../collections'

type Snapshot = Awaited<ReturnType<typeof symphonyControlOps.fetchSnapshot>>
type RunWorker = (input: RunAndPersistWebSymphonyWorkerGoalInput) => Promise<unknown>
type FetchSnapshot = () => Promise<Snapshot>

export interface SymphonyWorkerPanelProps {
  runWorker?: RunWorker
  fetchSnapshot?: FetchSnapshot
  defaultWorkspacePath?: string
}

interface WorkerSummary {
  id: string
  title: string
  status: string
  backend?: string
  updatedAt?: string
}

const runningStatuses = new Set(['planned', 'running', 'active', 'pending'])

export function SymphonyWorkerPanel({
  runWorker = runAndPersistWebSymphonyWorkerGoal,
  fetchSnapshot = symphonyControlOps.fetchSnapshot,
  defaultWorkspacePath = '',
}: SymphonyWorkerPanelProps) {
  const { session } = useSession()
  const { db, status: dbStatus } = useSolidDatabase()
  const selectedChatId = useChatStore((state) => state.selectedChatId)
  const selectedThreadId = useChatStore((state) => state.selectedThreadId)
  const [isOpen, setIsOpen] = useState(false)
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [objective, setObjective] = useState('')
  const [workspacePath, setWorkspacePath] = useState(defaultWorkspacePath)
  const [backend, setBackend] = useState<'codex' | 'claude' | 'codebuddy'>('codex')
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isStarting, setIsStarting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setWorkspacePath((current) => current || defaultWorkspacePath)
  }, [defaultWorkspacePath])

  const workers = useMemo(() => summarizeWorkers(snapshot), [snapshot])
  const activeCount = workers.filter((worker) => runningStatuses.has(worker.status)).length

  const refresh = async () => {
    setIsRefreshing(true)
    setError(null)
    try {
      setSnapshot(await fetchSnapshot())
    } catch (refreshError) {
      setError(formatError(refreshError, '无法读取 worker 状态。'))
    } finally {
      setIsRefreshing(false)
    }
  }

  useEffect(() => {
    if (dbStatus === 'ready') {
      void refresh()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dbStatus])

  const canStart = Boolean(db && session.info.webId && objective.trim() && workspacePath.trim() && !isStarting)

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (!canStart || !db || !session.info.webId) return

    setIsStarting(true)
    setError(null)
    try {
      await runWorker({
        db: db as SolidDatabase & RunAndPersistWebSymphonyWorkerGoalInput['db'],
        webId: session.info.webId,
        objective: objective.trim(),
        acceptanceCriteria: ['Worker reports final Delivery, Evidence, and follow-up candidates.'],
        workspacePath: workspacePath.trim(),
        ...(isHttpUrl(workspacePath.trim()) ? { container: workspacePath.trim() } : {}),
        backend,
        ...(selectedChatId && isResourceRef(selectedChatId) ? { chat: selectedChatId } : {}),
        ...(selectedThreadId && isResourceRef(selectedThreadId) ? { thread: selectedThreadId } : {}),
      })
      setObjective('')
      setIsOpen(true)
      await refresh()
    } catch (startError) {
      setError(formatError(startError, '无法启动 worker。'))
    } finally {
      setIsStarting(false)
    }
  }

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <Card className="overflow-hidden rounded-lg border-border/50 shadow-none">
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer px-4 py-3 transition-colors hover:bg-muted/50">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-sm font-medium">
                <Bot className="h-4 w-4 text-muted-foreground" />
                Worker
                <span className="text-xs font-normal text-muted-foreground">({workers.length})</span>
                {activeCount > 0 ? (
                  <span className="rounded-full bg-success/10 px-1.5 py-0.5 text-[10px] font-medium text-success">
                    {activeCount} running
                  </span>
                ) : null}
              </CardTitle>
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  disabled={isRefreshing}
                  onClick={(event) => {
                    event.stopPropagation()
                    void refresh()
                  }}
                  aria-label="刷新 worker 状态"
                >
                  <RefreshCw className={cn('h-3.5 w-3.5', isRefreshing && 'animate-spin')} />
                </Button>
                {isOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
              </div>
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="space-y-3 px-4 pb-4 pt-0">
            <div className="space-y-2">
              {workers.length === 0 ? (
                <div className="rounded-md border border-dashed border-border/60 p-3 text-xs text-muted-foreground">
                  暂无 worker。这里读取 Pod 里的 Issue / Task / Session / Run 状态，不读取 CLI 本地 archive。
                </div>
              ) : (
                <div className="space-y-1.5">
                  {workers.slice(0, 5).map((worker) => (
                    <div key={worker.id} className="rounded-md border border-border/50 bg-background/60 px-2.5 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0 truncate text-xs font-medium text-foreground">{worker.title}</div>
                        <span className={cn('shrink-0 rounded-full px-1.5 py-0.5 text-[10px]', statusClass(worker.status))}>
                          {worker.status}
                        </span>
                      </div>
                      <div className="mt-1 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                        <span>{worker.backend ?? 'worker'}</span>
                        {worker.updatedAt ? <span>{formatRelativeTime(worker.updatedAt)}</span> : null}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <form className="space-y-2 border-t border-border/50 pt-3" onSubmit={handleSubmit}>
              <Textarea
                value={objective}
                onChange={(event) => setObjective(event.target.value)}
                placeholder="交给 Codex 的目标…"
                className="min-h-20 resize-none text-xs"
              />
              <input
                value={workspacePath}
                onChange={(event) => setWorkspacePath(event.target.value)}
                placeholder="workspace path 或 Pod container URL"
                className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs outline-none focus:ring-1 focus:ring-primary"
              />
              <div className="flex items-center gap-2">
                <select
                  value={backend}
                  onChange={(event) => setBackend(event.target.value as 'codex' | 'claude' | 'codebuddy')}
                  className="h-8 rounded-md border border-border bg-background px-2 text-xs outline-none focus:ring-1 focus:ring-primary"
                  aria-label="Worker backend"
                >
                  <option value="codex">Codex</option>
                  <option value="claude">Claude</option>
                  <option value="codebuddy">CodeBuddy</option>
                </select>
                <Button type="submit" size="sm" className="h-8 flex-1 text-xs" disabled={!canStart}>
                  {isStarting ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Play className="mr-1.5 h-3.5 w-3.5" />}
                  启动 worker
                </Button>
              </div>
            </form>

            {error ? <div className="rounded-md bg-destructive/10 px-2 py-1.5 text-xs text-destructive">{error}</div> : null}
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  )
}

function summarizeWorkers(snapshot: Snapshot | null): WorkerSummary[] {
  if (!snapshot) return []
  const taskByIri = new Map<string, Record<string, unknown>>()
  for (const task of snapshot.tasks as Array<Record<string, unknown>>) {
    const id = typeof task.id === 'string' ? task.id : undefined
    const uri = typeof task.uri === 'string' ? task.uri : undefined
    if (id) taskByIri.set(id, task)
    if (uri) taskByIri.set(uri, task)
  }

  return (snapshot.sessions as Array<Record<string, unknown>>)
    .map((session, index): WorkerSummary => {
      const taskRef = typeof session.task === 'string' ? session.task : undefined
      const task = taskRef ? taskByIri.get(taskRef) : undefined
      const metadata = isRecord(session.metadata) ? session.metadata : undefined
      const worker = Array.isArray(metadata?.workers) && isRecord(metadata.workers[0]) ? metadata.workers[0] : undefined
      const title = stringValue(task?.title) ?? stringValue(worker?.title) ?? stringValue(session.title) ?? `Worker ${index + 1}`
      return {
        id: stringValue(session.id) ?? stringValue(session.uri) ?? `worker-${index}`,
        title,
        status: stringValue(session.status) ?? stringValue(worker?.status) ?? 'unknown',
        backend: stringValue(session.tool) ?? stringValue(session.backend) ?? stringValue(worker?.backend),
        updatedAt: stringValue(session.updatedAt) ?? stringValue(worker?.updatedAt) ?? stringValue(session.createdAt),
      }
    })
    .sort((left, right) => (right.updatedAt ?? '').localeCompare(left.updatedAt ?? ''))
}

function statusClass(status: string): string {
  if (status === 'running' || status === 'active') return 'bg-success/10 text-success'
  if (status === 'failed' || status === 'error') return 'bg-destructive/10 text-destructive'
  if (status === 'planned' || status === 'pending') return 'bg-warning/10 text-warning'
  return 'bg-muted text-muted-foreground'
}

function formatRelativeTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

function formatError(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

function isResourceRef(value: string): boolean {
  return value.startsWith('http://') || value.startsWith('https://') || value.startsWith('urn:')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined
}
