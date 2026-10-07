import { useCallback, useMemo, useState } from 'react'
import { PlayCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { formatLoginErrorForUser } from '@/modules/login/error-messages'
import { SessionControlBar, type SessionStatus } from '../../components/SessionControlBar'
import { useChatMutations, useWorkspaceList } from '../../collections'
import {
  fetchRuntimeSessionLog,
  isRuntimeSessionMode,
  resolveLocalContainer,
  useRuntimeSession,
  useRuntimeSessionEvents,
  type RuntimeEventConnectionState,
  type RuntimeSessionEvent,
  type RuntimeToolType,
} from '../../runtime-client'
import { classifyRuntimeTool } from '../../domain/runtime-tool-category'
import { buildWorkspaceSummary } from '../../workspace-summary'

interface RuntimeActivity {
  label: string
  technicalName?: string
  tone: 'running' | 'waiting'
}

function mapSessionStatus(status: 'idle' | 'active' | 'paused' | 'completed' | 'error'): SessionStatus {
  return status === 'idle' ? 'completed' : status
}

function formatDuration(updatedAt?: string) {
  if (!updatedAt) return '刚刚'
  const minutes = Math.floor(Math.max(0, Date.now() - new Date(updatedAt).getTime()) / 60_000)
  if (minutes < 1) return '刚刚'
  if (minutes < 60) return `${minutes} 分钟`
  return `${Math.floor(minutes / 60)} 小时`
}

function describeRuntimeTool(name: string): RuntimeActivity {
  switch (classifyRuntimeTool(name)) {
    case 'search': return { label: '正在搜索相关资料', technicalName: name, tone: 'running' }
    case 'read': return { label: '正在读取工作区内容', technicalName: name, tone: 'running' }
    case 'write': return { label: '等待确认工作区变更', technicalName: name, tone: 'waiting' }
    case 'execute': return { label: '正在运行工作区命令', technicalName: name, tone: 'running' }
    default: return { label: '正在使用工作区工具', technicalName: name, tone: 'running' }
  }
}

export interface RuntimeSessionToolbarProps {
  threadId: string
  threadTitle: string
  workspaceUri?: string | null
}

export function RuntimeSessionToolbar({ threadId, threadTitle, workspaceUri }: RuntimeSessionToolbarProps) {
  const runtime = useRuntimeSession(threadId)
  const mutations = useChatMutations()
  const { data: workspaces = [] } = useWorkspaceList({ enabled: Boolean(workspaceUri) })
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [repoPath, setRepoPath] = useState('')
  const [folderPath, setFolderPath] = useState('')
  const [tool, setTool] = useState<RuntimeToolType>('codex')
  const [baseRef, setBaseRef] = useState('HEAD')
  const [branch, setBranch] = useState('')
  const [runtimeError, setRuntimeError] = useState<string | null>(null)
  const [runtimeActivity, setRuntimeActivity] = useState<RuntimeActivity | null>(null)
  const [connectionState, setConnectionState] = useState<RuntimeEventConnectionState>('connected')
  const refetchRuntime = runtime.refetch

  const handleRuntimeEvent = useCallback((event: RuntimeSessionEvent) => {
    if (event.type === 'status' || event.type === 'exit') {
      setRuntimeError(null)
      if (event.type === 'exit' || event.status !== 'active') setRuntimeActivity(null)
      void refetchRuntime()
    } else if (event.type === 'assistant_delta') {
      setRuntimeActivity({ label: '正在整理回复', tone: 'running' })
    } else if (event.type === 'assistant_done') {
      setRuntimeActivity(null)
    } else if (event.type === 'tool_call') {
      setRuntimeActivity(describeRuntimeTool(event.name))
    } else if (event.type === 'auth_required') {
      setRuntimeActivity({ label: '等待完成认证后继续', tone: 'waiting' })
    } else if (event.type === 'error') {
      setRuntimeActivity(null)
      setRuntimeError(formatLoginErrorForUser(event.message, '运行时执行失败。请稍后重试。'))
      void refetchRuntime()
    }
  }, [refetchRuntime])

  useRuntimeSessionEvents(runtime.runtimeSession?.id, handleRuntimeEvent, Boolean(runtime.runtimeSession), setConnectionState)

  const resetDialog = useCallback(() => {
    setIsDialogOpen(false)
    setRepoPath('')
    setFolderPath('')
    setTool('codex')
    setBaseRef('HEAD')
    setBranch('')
  }, [])

  const createSession = useCallback(async () => {
    const normalizedRepoPath = repoPath.trim()
    const normalizedFolderPath = folderPath.trim() || normalizedRepoPath
    const normalizedBaseRef = baseRef.trim() || 'HEAD'
    const normalizedBranch = branch.trim() || undefined
    const boundWorkspace = workspaceUri?.trim() || ''
    const canUsePodWorkspace = /^https?:\/\//u.test(boundWorkspace)
    if (!normalizedRepoPath && !canUsePodWorkspace) {
      setRuntimeError('请先填写仓库路径。')
      return
    }

    try {
      setRuntimeError(null)
      if (!normalizedRepoPath && canUsePodWorkspace) {
        const created = await runtime.createSession.mutateAsync({
          threadId,
          container: boundWorkspace,
          workspaceKind: 'pod-container',
          title: threadTitle || '运行时会话',
          tool,
          baseRef: normalizedBaseRef,
          branch: normalizedBranch,
        })
        await runtime.startSession.mutateAsync(created.id)
      } else {
        const requestedWorkspaceUri = await resolveLocalContainer(normalizedFolderPath)
        const resolvedWorkspaceUri = await mutations.ensureThreadWorkspace.mutateAsync({
          threadId,
          workspaceUri: requestedWorkspaceUri,
          title: threadTitle || '运行时会话',
          repoPath: normalizedRepoPath,
          folderPath: normalizedFolderPath,
          baseRef: normalizedBaseRef,
          branch: normalizedBranch,
        })
        const created = await runtime.createSession.mutateAsync({
          threadId,
          container: resolvedWorkspaceUri,
          title: threadTitle || '运行时会话',
          repoPath: normalizedRepoPath,
          folderPath: normalizedFolderPath,
          tool,
          baseRef: normalizedBaseRef,
          branch: normalizedBranch,
        })
        await runtime.startSession.mutateAsync(created.id)
      }
      await runtime.refetch()
      resetDialog()
    } catch (error) {
      console.error('Create runtime session failed:', error)
      setRuntimeError(formatLoginErrorForUser(error, '创建运行时会话失败。请检查工作区设置后重试。'))
    }
  }, [baseRef, branch, folderPath, mutations.ensureThreadWorkspace, repoPath, resetDialog, runtime, threadId, threadTitle, tool, workspaceUri])

  const pause = useCallback(async () => {
    if (!runtime.runtimeSession) return
    setRuntimeError(null)
    await runtime.pauseSession.mutateAsync(runtime.runtimeSession.id)
  }, [runtime])
  const resume = useCallback(async () => {
    if (!runtime.runtimeSession) return
    setRuntimeError(null)
    await runtime.resumeSession.mutateAsync(runtime.runtimeSession.id)
  }, [runtime])
  const stop = useCallback(async () => {
    if (!runtime.runtimeSession) return
    setRuntimeError(null)
    await runtime.stopSession.mutateAsync(runtime.runtimeSession.id)
  }, [runtime])
  const copyLog = useCallback(async () => {
    if (!runtime.runtimeSession) return
    try {
      setRuntimeError(null)
      await navigator.clipboard.writeText(await fetchRuntimeSessionLog(runtime.runtimeSession.id))
    } catch (error) {
      setRuntimeError(formatLoginErrorForUser(error, '复制运行时日志失败。请稍后重试。'))
    }
  }, [runtime.runtimeSession])

  const workspaceSummary = useMemo(() => buildWorkspaceSummary({
    workspaceUri,
    workspaces,
    runtimeSession: runtime.runtimeSession,
  }), [runtime.runtimeSession, workspaceUri, workspaces])

  if (!isRuntimeSessionMode()) return null
  const current = runtime.runtimeSession
  const isBusy = runtime.createSession.isPending
    || runtime.startSession.isPending
    || runtime.pauseSession.isPending
    || runtime.resumeSession.isPending
    || runtime.stopSession.isPending

  return (
    <>
      {current ? (
        <>
          <SessionControlBar
            title={current.title}
            status={mapSessionStatus(current.status)}
            tool={current.tool}
            tokenUsage={current.tokenUsage}
            duration={formatDuration(current.updatedAt)}
            workspacePrimary={workspaceSummary?.primaryText}
            workspaceSecondary={workspaceSummary ? [workspaceSummary.kindLabel, workspaceSummary.secondaryText].filter(Boolean).join(' · ') : undefined}
            onPause={current.status === 'active' ? pause : undefined}
            onResume={current.status === 'paused' ? resume : undefined}
            onStop={current.status === 'active' || current.status === 'paused' ? stop : undefined}
            onCopyLog={copyLog}
          />
          {runtimeActivity ? (
            <details className="group border-b border-border/50 bg-muted/10 px-4 py-2 text-xs">
              <summary className="flex cursor-pointer list-none items-center gap-2 text-muted-foreground marker:hidden">
                <span className={`size-1.5 rounded-full ${runtimeActivity.tone === 'waiting' ? 'bg-warning' : 'animate-pulse bg-primary'}`} aria-hidden="true" />
                <span>{runtimeActivity.label}</span>
                <span className="ml-auto text-[11px] opacity-70 group-open:hidden">查看详情</span>
              </summary>
              {runtimeActivity.technicalName ? <p className="mt-2 pl-3.5 text-[11px] text-muted-foreground">工具：<code>{runtimeActivity.technicalName}</code></p> : null}
            </details>
          ) : null}
          {connectionState === 'reconnecting' ? <div role="status" className="border-b border-warning/20 bg-warning/5 px-4 py-2 text-xs text-muted-foreground">运行时连接已中断，正在自动恢复…</div> : null}
          {runtimeError ? <div className="border-b border-border/50 px-4 py-2 text-xs text-destructive">{runtimeError}</div> : null}
        </>
      ) : (
        <div className="flex items-center justify-between gap-3 border-b border-border/50 bg-muted/20 px-4 py-3">
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground">{workspaceSummary ? `当前话题已绑定${workspaceSummary.kindLabel}` : '当前话题仅保存到空间'}</p>
            <p className="text-xs text-muted-foreground">{workspaceSummary ? [workspaceSummary.primaryText, workspaceSummary.secondaryText].filter(Boolean).join(' · ') : '需要远程运行时时，再为这个聊天话题绑定运行时会话与文件夹即可。'}</p>
            {runtimeError ? <p className="mt-1 text-xs text-destructive">{runtimeError}</p> : null}
          </div>
          <Button variant="outline" size="sm" className="h-8 shrink-0" onClick={() => setIsDialogOpen(true)}><PlayCircle className="mr-1 h-4 w-4" />创建运行时会话</Button>
        </div>
      )}

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>创建运行时会话</DialogTitle><DialogDescription>为当前话题绑定一个本地运行时与文件夹。</DialogDescription></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2"><Label htmlFor="runtime-repo-path">仓库路径</Label><Input id="runtime-repo-path" value={repoPath} onChange={(event) => setRepoPath(event.target.value)} placeholder="例如：/Users/ganlu/develop/linx" /></div>
            <div className="space-y-2"><Label htmlFor="runtime-folder-path">文件夹路径</Label><Input id="runtime-folder-path" value={folderPath} onChange={(event) => setFolderPath(event.target.value)} placeholder="留空则默认使用仓库路径" /></div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2"><Label htmlFor="runtime-tool">工具</Label><Input id="runtime-tool" value={tool} onChange={(event) => setTool(event.target.value as RuntimeToolType)} placeholder="codex" /></div>
              <div className="space-y-2"><Label htmlFor="runtime-base-ref">Base Ref</Label><Input id="runtime-base-ref" value={baseRef} onChange={(event) => setBaseRef(event.target.value)} placeholder="HEAD" /></div>
              <div className="space-y-2"><Label htmlFor="runtime-branch">Branch</Label><Input id="runtime-branch" value={branch} onChange={(event) => setBranch(event.target.value)} placeholder="留空则自动生成" /></div>
            </div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setIsDialogOpen(false)}>取消</Button><Button onClick={createSession} disabled={isBusy}>{isBusy ? '处理中...' : '创建并启动'}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
