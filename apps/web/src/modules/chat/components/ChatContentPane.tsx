/**
 * ChatContentPane - AI 聊天内容面板
 *
 * 使用 OpenAI ChatKit SDK 作为主交互层。
 * Pod 负责留档；当本地 service 中存在运行时会话时，
 * ChatKit 的 assistant 响应会经由 runtime 转发并流式返回。
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useSession } from '@/providers/solid-session-context'
import { useNavigate } from '@tanstack/react-router'
import { Bot, Download, ExternalLink, LockKeyhole, Paperclip, PlayCircle, ShieldAlert, WifiOff } from 'lucide-react'
import { useChatKit, ChatKit as ChatKitComponent } from '@openai/chatkit-react'
import type { MicroAppPaneProps } from '@/modules/layout/micro-app-registry'
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
import { useInboxItems } from '@/modules/inbox/collections'
import { isActionableInboxItem } from '@/modules/inbox/utils'
import { useInboxStore } from '@/modules/inbox/store'
import { useSolidDatabase } from '@/providers/solid-database-provider'
import { formatLoginErrorForUser } from '@/modules/login/error-messages'
import { createLocalChatKitFetch, unavailableResponse } from '../services/chatkit-local/fetch-handler'
import type { Attachment } from '@/lib/vendor/xpod-chatkit'
import { useChatStore } from '../store'
import {
  useChatInit,
  useChatList,
  useChatMutations,
  useThreadList,
  useWorkspaceList,
  useLinxDefaultSecretaryBootstrapSettling,
  LINX_DEFAULT_SECRETARY,
  projectChatSummary,
} from '../collections'
import { SessionControlBar, type SessionStatus } from './SessionControlBar'
import { ChatListPane } from './ChatListPane'
import {
  fetchRuntimeSessionLog,
  isRuntimeSessionMode,
  resolveLocalContainer,
  useRuntimeSession,
  useRuntimeSessionEvents,
  type RuntimeSessionEvent,
  type RuntimeToolType,
} from '../runtime-client'
import { buildWorkspaceSummary } from '../workspace-summary'
import { restoreChatMessageAnchor } from '../message-anchor'
import { projectChatContentState, type ChatContentState, type ChatContentStateKind } from '../domain/chat-content-state'
import { clearChatDraft, loadChatDraft, saveChatDraft, type ChatDraftScope } from '../draft-store'
import {
  SecretaryWelcome,
  type SecretaryStarterAction,
} from '../ui/SecretaryWelcome'

export interface ChatContentPaneProps extends MicroAppPaneProps {}

interface PendingSecretaryDraft {
  text: string
  attempt: number
  chatId: string
  scopeKey: string
}

interface ScopedSecretaryDraft {
  text: string
  scopeKey: string
}

interface ScopedSecretaryError {
  message: string
  scopeKey: string
  chatId: string
}

const SECRETARY_STARTER_ACTIONS: readonly SecretaryStarterAction[] = [
  { id: 'organize', label: '整理今天的工作', prompt: '帮我整理今天需要推进的工作' },
  { id: 'find', label: '查找空间中的资料', prompt: '帮我查找当前空间中的相关资料' },
  { id: 'plan', label: '规划下一步', prompt: '根据当前上下文规划下一步' },
]

const CONTENT_FAILURE_COPY: Partial<Record<ChatContentStateKind, { title: string; description: string }>> = {
  forbidden: {
    title: '无法读取当前空间中的聊天',
    description: '当前账号没有读取这个空间的权限。权限更新后可以重试。',
  },
  timeout: {
    title: '读取聊天超时',
    description: '当前空间没有在限定时间内响应。请检查连接后重试。',
  },
  'not-found': {
    title: '找不到这个聊天',
    description: '当前空间中没有匹配的聊天记录。可以重新读取或从列表选择其他聊天。',
  },
  unavailable: {
    title: '无法读取聊天',
    description: '读取当前空间时发生错误。请检查连接后重试。',
  },
}

const LOGIN_REQUIRED_RETRY_DELAY_MS = 250
const LOGIN_REQUIRED_GRACE_MS = 2000

function EmptyState({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return (
    <div className="flex flex-1 items-center justify-center bg-muted/30">
      <div className="max-w-sm px-6 text-center">
        <Bot className="mx-auto mb-4 h-16 w-16 text-muted-foreground/20" />
        <p className="mb-2 font-medium text-foreground">{title}</p>
        <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>
        {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
      </div>
    </div>
  )
}

function useThemeMode(): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'light'
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light'
}

function mapSessionStatus(status: 'idle' | 'active' | 'paused' | 'completed' | 'error'): SessionStatus {
  if (status === 'idle') return 'completed'
  return status
}

function formatDuration(updatedAt?: string) {
  if (!updatedAt) return '刚刚'
  const delta = Math.max(0, Date.now() - new Date(updatedAt).getTime())
  const minutes = Math.floor(delta / 60000)
  if (minutes < 1) return '刚刚'
  if (minutes < 60) return `${minutes} 分钟`
  const hours = Math.floor(minutes / 60)
  return `${hours} 小时`
}

interface RuntimeActivity {
  label: string
  technicalName?: string
  tone: 'running' | 'waiting'
}

function describeRuntimeTool(name: string): RuntimeActivity {
  const normalized = name.toLowerCase()
  if (/(search|grep|find|lookup|query)/.test(normalized)) {
    return { label: '正在搜索相关资料', technicalName: name, tone: 'running' }
  }
  if (/(read|open|list|inspect|view)/.test(normalized)) {
    return { label: '正在读取工作区内容', technicalName: name, tone: 'running' }
  }
  if (/(write|edit|patch|delete|remove|move)/.test(normalized)) {
    return { label: '等待确认工作区变更', technicalName: name, tone: 'waiting' }
  }
  if (/(exec|shell|bash|terminal|command)/.test(normalized)) {
    return { label: '正在运行工作区命令', technicalName: name, tone: 'running' }
  }
  return { label: '正在使用工作区工具', technicalName: name, tone: 'running' }
}

function InboxActionBanner({
  chatId,
  threadId,
}: {
  chatId: string
  threadId: string
}) {
  const navigate = useNavigate()
  const selectItem = useInboxStore((state) => state.selectItem)
  const setFilter = useInboxStore((state) => state.setFilter)
  const isDefaultSecretarySettling = useLinxDefaultSecretaryBootstrapSettling()
  const { data: inboxItems = [] } = useInboxItems('all', { enabled: !isDefaultSecretarySettling })

  const actionableItems = useMemo(
    () =>
      inboxItems.filter(
        (item) =>
          item.chatId === chatId
          && (!item.threadId || item.threadId === threadId)
          && isActionableInboxItem(item),
      ),
    [chatId, inboxItems, threadId],
  )

  const primaryItem = useMemo(
    () =>
      actionableItems.find((item) => item.category === 'auth_required')
      ?? actionableItems.find((item) => item.kind === 'approval' && item.status === 'pending')
      ?? null,
    [actionableItems],
  )

  const handleOpenInbox = useCallback(() => {
    if (!primaryItem) return
    setFilter('pending')
    selectItem(primaryItem.id)
    navigate({ to: '/$microAppId', params: { microAppId: 'inbox' } })
  }, [navigate, primaryItem, selectItem, setFilter])

  if (!primaryItem) {
    return null
  }

  const isAuthRequired = primaryItem.category === 'auth_required'
  const Icon = isAuthRequired ? LockKeyhole : ShieldAlert
  const title = isAuthRequired
    ? '当前话题等待认证'
    : `当前话题有 ${actionableItems.length} 条待处理授权`
  const description = isAuthRequired
    ? '请先在收件箱完成认证，再继续当前 runtime 会话。'
    : '授权统一在收件箱处理；处理完成后 runtime 会自动续跑。'

  return (
    <div className="flex items-center justify-between gap-3 border-b border-warning/20 bg-warning/5 px-4 py-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
          <Icon className="h-4 w-4 text-warning" />
          <span>{title}</span>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">{description}</p>
      </div>
      <Button variant="outline" size="sm" className="h-8 shrink-0" onClick={handleOpenInbox}>
        打开收件箱
      </Button>
    </div>
  )
}

function RuntimeSessionToolbar({
  threadId,
  threadTitle,
  workspaceUri,
}: {
  threadId: string
  threadTitle: string
  workspaceUri?: string | null
}) {
  const runtimeSession = useRuntimeSession(threadId)
  const mutations = useChatMutations()
  const { data: workspaces = [] } = useWorkspaceList({
    enabled: !!workspaceUri,
  })
  const isSessionMode = isRuntimeSessionMode()
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [repoPath, setRepoPath] = useState('')
  const [folderPath, setFolderPath] = useState('')
  const [tool, setTool] = useState<RuntimeToolType>('codex')
  const [baseRef, setBaseRef] = useState('HEAD')
  const [branch, setBranch] = useState('')
  const [runtimeError, setRuntimeError] = useState<string | null>(null)
  const [runtimeActivity, setRuntimeActivity] = useState<RuntimeActivity | null>(null)

  const handleRuntimeSessionEvent = useCallback((event: RuntimeSessionEvent) => {
    if (event.type === 'status' || event.type === 'exit') {
      setRuntimeError(null)
      if (event.type === 'exit' || event.status !== 'active') setRuntimeActivity(null)
      void runtimeSession.refetch()
      return
    }

    if (event.type === 'assistant_delta') {
      setRuntimeActivity({ label: '正在整理回复', tone: 'running' })
      return
    }

    if (event.type === 'assistant_done') {
      setRuntimeActivity(null)
      return
    }

    if (event.type === 'tool_call') {
      setRuntimeActivity(describeRuntimeTool(event.name))
      return
    }

    if (event.type === 'auth_required') {
      setRuntimeActivity({ label: '等待完成认证后继续', tone: 'waiting' })
      return
    }

    if (event.type === 'error') {
      setRuntimeActivity(null)
      setRuntimeError(formatLoginErrorForUser(event.message, '运行时执行失败。请稍后重试。'))
      void runtimeSession.refetch()
    }
  }, [runtimeSession])

  useRuntimeSessionEvents(
    runtimeSession.runtimeSession?.id,
    handleRuntimeSessionEvent,
    !!runtimeSession.runtimeSession,
  )

  const handleCreateRuntimeSession = useCallback(async () => {
    const normalizedRepoPath = repoPath.trim()
    const normalizedFolderPath = folderPath.trim() || normalizedRepoPath
    const normalizedBaseRef = baseRef.trim() || 'HEAD'
    const normalizedBranch = branch.trim()
    const boundPodWorkspaceUri = workspaceUri?.trim() || ''
    const canUseBoundPodWorkspace = /^https?:\/\//u.test(boundPodWorkspaceUri)

    if (!normalizedRepoPath && !canUseBoundPodWorkspace) {
      setRuntimeError('请先填写仓库路径。')
      return
    }

    try {
      setRuntimeError(null)
      if (!normalizedRepoPath && canUseBoundPodWorkspace) {
        const created = await runtimeSession.createSession.mutateAsync({
          threadId,
          container: boundPodWorkspaceUri,
          workspaceKind: 'pod-container',
          title: threadTitle || '运行时会话',
          tool,
          baseRef: normalizedBaseRef,
          branch: normalizedBranch || undefined,
        })
        await runtimeSession.startSession.mutateAsync(created.id)
        await runtimeSession.refetch()
        setIsDialogOpen(false)
        setTool('codex')
        setBaseRef('HEAD')
        setBranch('')
        return
      }

      const requestedWorkspaceUri = await resolveLocalContainer(normalizedFolderPath)
      const resolvedWorkspaceUri = await mutations.ensureThreadWorkspace.mutateAsync({
        threadId,
        workspaceUri: requestedWorkspaceUri,
        title: threadTitle || '运行时会话',
        repoPath: normalizedRepoPath,
        folderPath: normalizedFolderPath,
        baseRef: normalizedBaseRef,
        branch: normalizedBranch || undefined,
      })
      const created = await runtimeSession.createSession.mutateAsync({
        threadId,
        container: resolvedWorkspaceUri,
        title: threadTitle || '运行时会话',
        repoPath: normalizedRepoPath,
        folderPath: normalizedFolderPath,
        tool,
        baseRef: normalizedBaseRef,
        branch: normalizedBranch || undefined,
      })
      await runtimeSession.startSession.mutateAsync(created.id)
      await runtimeSession.refetch()
      setIsDialogOpen(false)
      setRepoPath('')
      setFolderPath('')
      setTool('codex')
      setBaseRef('HEAD')
      setBranch('')
    } catch (error) {
      console.error('Create runtime session failed:', error)
      setRuntimeError(formatLoginErrorForUser(error, '创建运行时会话失败。请检查工作区设置后重试。'))
    }
  }, [baseRef, branch, folderPath, mutations.ensureThreadWorkspace, repoPath, runtimeSession, threadId, threadTitle, tool, workspaceUri])

  const handlePause = useCallback(async () => {
    if (!runtimeSession.runtimeSession) return
    setRuntimeError(null)
    await runtimeSession.pauseSession.mutateAsync(runtimeSession.runtimeSession.id)
  }, [runtimeSession])

  const handleResume = useCallback(async () => {
    if (!runtimeSession.runtimeSession) return
    setRuntimeError(null)
    await runtimeSession.resumeSession.mutateAsync(runtimeSession.runtimeSession.id)
  }, [runtimeSession])

  const handleStop = useCallback(async () => {
    if (!runtimeSession.runtimeSession) return
    setRuntimeError(null)
    await runtimeSession.stopSession.mutateAsync(runtimeSession.runtimeSession.id)
  }, [runtimeSession])

  const handleCopyLog = useCallback(async () => {
    if (!runtimeSession.runtimeSession) return
    try {
      setRuntimeError(null)
      const log = await fetchRuntimeSessionLog(runtimeSession.runtimeSession.id)
      await navigator.clipboard.writeText(log)
    } catch (error) {
      console.error('Copy runtime session log failed:', error)
      setRuntimeError(formatLoginErrorForUser(error, '复制运行时日志失败。请稍后重试。'))
    }
  }, [runtimeSession])

  const workspaceSummary = useMemo(
    () => buildWorkspaceSummary({
      workspaceUri,
      workspaces,
      runtimeSession: runtimeSession.runtimeSession,
    }),
    [runtimeSession.runtimeSession, workspaceUri, workspaces],
  )

  if (!isSessionMode) {
    return null
  }

  const currentSession = runtimeSession.runtimeSession
  const isBusy = runtimeSession.createSession.isPending
    || runtimeSession.startSession.isPending
    || runtimeSession.pauseSession.isPending
    || runtimeSession.resumeSession.isPending
    || runtimeSession.stopSession.isPending

  return (
    <>
      {currentSession ? (
        <>
          <SessionControlBar
            title={currentSession.title}
            status={mapSessionStatus(currentSession.status)}
            tool={currentSession.tool}
            tokenUsage={currentSession.tokenUsage}
            duration={formatDuration(currentSession.updatedAt)}
            workspacePrimary={workspaceSummary?.primaryText}
            workspaceSecondary={
              workspaceSummary
                ? [workspaceSummary.kindLabel, workspaceSummary.secondaryText].filter(Boolean).join(' · ')
                : undefined
            }
            onPause={currentSession.status === 'active' ? handlePause : undefined}
            onResume={currentSession.status === 'paused' ? handleResume : undefined}
            onStop={currentSession.status === 'active' || currentSession.status === 'paused' ? handleStop : undefined}
            onCopyLog={handleCopyLog}
          />
          {runtimeActivity ? (
            <details className="group border-b border-border/50 bg-muted/10 px-4 py-2 text-xs">
              <summary className="flex cursor-pointer list-none items-center gap-2 text-muted-foreground marker:hidden">
                <span
                  className={`size-1.5 rounded-full ${runtimeActivity.tone === 'waiting' ? 'bg-warning' : 'animate-pulse bg-primary'}`}
                  aria-hidden="true"
                />
                <span>{runtimeActivity.label}</span>
                <span className="ml-auto text-[11px] opacity-70 group-open:hidden">查看详情</span>
              </summary>
              {runtimeActivity.technicalName ? (
                <p className="mt-2 pl-3.5 text-[11px] text-muted-foreground">
                  工具：<code>{runtimeActivity.technicalName}</code>
                </p>
              ) : null}
            </details>
          ) : null}
          {runtimeError && (
            <div className="border-b border-border/50 px-4 py-2 text-xs text-destructive">
              {runtimeError}
            </div>
          )}
        </>
      ) : (
        <div className="flex items-center justify-between gap-3 border-b border-border/50 bg-muted/20 px-4 py-3">
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground">
              {workspaceSummary ? `当前话题已绑定${workspaceSummary.kindLabel}` : '当前话题仅保存到空间'}
            </p>
            <p className="text-xs text-muted-foreground">
              {workspaceSummary
                ? [workspaceSummary.primaryText, workspaceSummary.secondaryText].filter(Boolean).join(' · ')
                : '需要远程运行时时，再为这个聊天话题绑定运行时会话与文件夹即可。'}
            </p>
            {runtimeError && (
              <p className="mt-1 text-xs text-destructive">{runtimeError}</p>
            )}
          </div>
          <Button variant="outline" size="sm" className="h-8 shrink-0" onClick={() => setIsDialogOpen(true)}>
            <PlayCircle className="mr-1 h-4 w-4" />
            创建运行时会话
          </Button>
        </div>
      )}

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>创建运行时会话</DialogTitle>
            <DialogDescription>
              为当前话题绑定一个本地运行时与文件夹。
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="runtime-repo-path">仓库路径</Label>
              <Input
                id="runtime-repo-path"
                value={repoPath}
                onChange={(event) => setRepoPath(event.target.value)}
                placeholder="例如：/Users/ganlu/develop/linx"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="runtime-folder-path">文件夹路径</Label>
              <Input
                id="runtime-folder-path"
                value={folderPath}
                onChange={(event) => setFolderPath(event.target.value)}
                placeholder="留空则默认使用仓库路径"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="runtime-tool">工具</Label>
                <Input
                  id="runtime-tool"
                  value={tool}
                  onChange={(event) => setTool(event.target.value as RuntimeToolType)}
                  placeholder="codex"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="runtime-base-ref">Base Ref</Label>
                <Input
                  id="runtime-base-ref"
                  value={baseRef}
                  onChange={(event) => setBaseRef(event.target.value)}
                  placeholder="HEAD"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="runtime-branch">Branch</Label>
                <Input
                  id="runtime-branch"
                  value={branch}
                  onChange={(event) => setBranch(event.target.value)}
                  placeholder="留空则自动生成"
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              取消
            </Button>
            <Button onClick={handleCreateRuntimeSession} disabled={isBusy}>
              {isBusy ? '处理中...' : '创建并启动'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

function ChatKitPanel({
  session,
  selectedThreadId,
  selectedChatId,
  selectedThreadTitle,
  pendingComposerDraft,
  onComposerDraftApplied,
  onComposerDraftError,
  sendDisabled,
}: {
  session: any
  selectedThreadId: string
  selectedChatId: string
  selectedThreadTitle?: string
  pendingComposerDraft: PendingSecretaryDraft | null
  onComposerDraftApplied: (draft: PendingSecretaryDraft) => void
  onComposerDraftError: (draft: PendingSecretaryDraft, error: unknown) => void
  sendDisabled: boolean
}) {
  const selectThread = useChatStore((state) => state.selectThread)
  const messageAnchorId = useChatStore((state) => state.messageAnchorId)
  const clearMessageAnchor = useChatStore((state) => state.clearMessageAnchor)
  const theme = useThemeMode()
  const { db } = useSolidDatabase()
  const [threadAttachments, setThreadAttachments] = useState<Attachment[]>([])
  const [attachmentsOpen, setAttachmentsOpen] = useState(false)
  const [previewAttachment, setPreviewAttachment] = useState<Attachment | null>(null)
  const [isOnline, setIsOnline] = useState(() => typeof navigator === 'undefined' || navigator.onLine)
  const [reconnectStatus, setReconnectStatus] = useState<'idle' | 'syncing' | 'error'>('idle')
  const sendAvailableRef = useRef(!sendDisabled && isOnline)
  sendAvailableRef.current = !sendDisabled && isOnline
  const chatKitHostRef = useRef<(HTMLElement & { setThreadId?: (threadId: string | null) => Promise<void> | void }) | null>(null)

  const localFetch = useMemo(() => {
    if (!db || !session.info.webId || !session.fetch) {
      return async () => unavailableResponse()
    }
    return createLocalChatKitFetch({
      db,
      webId: session.info.webId,
      authFetch: session.fetch,
      initialThread: {
        id: selectedThreadId,
        title: selectedThreadTitle,
        status: { type: 'active' },
        created_at: Math.floor(Date.now() / 1000),
        updated_at: Math.floor(Date.now() / 1000),
        metadata: { chat_id: selectedChatId },
      },
      isAvailable: () => sendAvailableRef.current,
      onAttachmentsChange: setThreadAttachments,
      onChatSummaryChange: ({ messageId, content, createdAt }) => {
        return projectChatSummary(selectedChatId, {
          lastMessageId: messageId,
          lastMessagePreview: content.slice(0, 100),
          lastActiveAt: createdAt,
          updatedAt: createdAt,
        })
      },
    })
  }, [db, selectedChatId, selectedThreadId, selectedThreadTitle, session.fetch, session.info.webId])

  useEffect(() => {
    setThreadAttachments([])
    setAttachmentsOpen(false)
  }, [selectedThreadId])

  const chatkit = useChatKit({
    api: {
      url: 'local://chatkit',
      domainKey: 'local',
      fetch: localFetch,
      uploadStrategy: { type: 'two_phase' },
    },
    initialThread: selectedThreadId,
    theme: {
      colorScheme: theme,
      color: {
        accent: {
          primary: '#735FC4',
          level: 2,
        },
      },
    },
    header: { enabled: false },
    history: { enabled: false },
    composer: {
      placeholder: '输入消息...',
      tools: [{
        id: 'web_search',
        label: '联网搜索',
        shortLabel: '搜索',
        icon: 'search',
        pinned: true,
        persistent: false,
        placeholderOverride: '搜索网络并给出可点击的来源...',
      }],
      attachments: {
        enabled: true,
        maxCount: 10,
        maxSize: 25 * 1024 * 1024,
      },
    },
    threadItemActions: { feedback: true, retry: true },
    thread: { autoScroll: true },
    onThreadChange: ({ threadId }: { threadId: string | null }) => {
      if (threadId) {
        selectThread(threadId)
      }
    },
    onError: ({ error }: { error: Error }) => {
      console.error('[ChatKit] Error:', error)
    },
  })
  const setComposerValue = chatkit.setComposerValue
  const fetchUpdates = chatkit.fetchUpdates

  useEffect(() => {
    const handleOffline = () => {
      setIsOnline(false)
      setReconnectStatus('idle')
    }
    const handleOnline = () => {
      setIsOnline(true)
      setReconnectStatus('syncing')
      void Promise.resolve(fetchUpdates()).then(
        () => setReconnectStatus('idle'),
        (error) => {
          console.error('[ChatKit] Failed to refresh after reconnect:', error)
          setReconnectStatus('error')
        },
      )
    }

    window.addEventListener('offline', handleOffline)
    window.addEventListener('online', handleOnline)
    return () => {
      window.removeEventListener('offline', handleOffline)
      window.removeEventListener('online', handleOnline)
    }
  }, [fetchUpdates])

  useEffect(() => {
    if (!selectedThreadId) return

    let disposed = false

    const switchThread = async () => {
      const registry = typeof window !== 'undefined' ? window.customElements : undefined
      const tagName = 'openai-chatkit'
      const element = chatKitHostRef.current
      const isChatKitElement = element?.tagName?.toLowerCase() === tagName

      if (isChatKitElement && registry?.whenDefined && !registry.get(tagName)) {
        try {
          await registry.whenDefined(tagName)
        } catch (error) {
          console.error('[ChatKit] Failed to wait for custom element definition:', error)
          return
        }
      }

      if (disposed) return

      const setThreadId = chatKitHostRef.current?.setThreadId
      if (typeof setThreadId !== 'function') {
        return
      }

      try {
        await setThreadId.call(chatKitHostRef.current, selectedThreadId)
      } catch (error) {
        console.error('[ChatKit] Failed to switch thread:', error)
      }
    }

    void switchThread()

    return () => {
      disposed = true
    }
  }, [selectedThreadId])

  useEffect(() => {
    if (!pendingComposerDraft) return

    let disposed = false
    const applyDraft = async () => {
      try {
        await setComposerValue({ text: pendingComposerDraft.text })
        if (!disposed) onComposerDraftApplied(pendingComposerDraft)
      } catch (error) {
        if (!disposed) onComposerDraftError(pendingComposerDraft, error)
      }
    }

    void applyDraft()
    return () => {
      disposed = true
    }
  }, [
    setComposerValue,
    onComposerDraftApplied,
    onComposerDraftError,
    pendingComposerDraft,
    selectedThreadId,
  ])

  useEffect(() => {
    if (!messageAnchorId || !chatKitHostRef.current) return

    let disposed = false
    let observer: MutationObserver | null = null
    let clearAnchorTimer: number | null = null

    const tryRestore = () => {
      if (disposed || !chatKitHostRef.current || !messageAnchorId) return false

      const restored = restoreChatMessageAnchor(chatKitHostRef.current, messageAnchorId)
      if (!restored) return false

      clearAnchorTimer = window.setTimeout(() => {
        if (!disposed) {
          clearMessageAnchor()
        }
      }, 2000)
      return true
    }

    if (tryRestore()) {
      return () => {
        disposed = true
        if (clearAnchorTimer !== null) {
          window.clearTimeout(clearAnchorTimer)
        }
      }
    }

    const observeRoot = chatKitHostRef.current.shadowRoot ?? chatKitHostRef.current
    observer = new MutationObserver(() => {
      if (tryRestore()) {
        observer?.disconnect()
        observer = null
      }
    })
    observer.observe(observeRoot, {
      childList: true,
      subtree: true,
      attributes: true,
    })

    const timeoutId = window.setTimeout(() => {
      observer?.disconnect()
      observer = null
    }, 4000)

    return () => {
      disposed = true
      observer?.disconnect()
      window.clearTimeout(timeoutId)
      if (clearAnchorTimer !== null) {
        window.clearTimeout(clearAnchorTimer)
      }
    }
  }, [clearMessageAnchor, messageAnchorId, selectedThreadId])

  return (
    <div
      data-testid="chatkit-send-boundary"
      className="relative h-full flex-1 overflow-hidden"
      aria-disabled={sendDisabled}
    >
      <ChatKitComponent
        ref={chatKitHostRef as any}
        control={chatkit.control}
        style={{ display: 'block', width: '100%', height: '100%' }}
      />
      {!isOnline ? (
        <div role="alert" className="absolute inset-x-3 top-3 z-20 flex items-center gap-2 rounded-lg border border-warning/25 bg-background/95 px-3 py-2 text-sm shadow-sm backdrop-blur">
          <WifiOff className="size-4 text-warning" />
          <span>网络已断开。草稿会保留在输入框中，恢复连接后再发送。</span>
        </div>
      ) : reconnectStatus !== 'idle' ? (
        <div
          role={reconnectStatus === 'error' ? 'alert' : 'status'}
          className="absolute inset-x-3 top-3 z-20 flex items-center justify-between gap-3 rounded-lg border bg-background/95 px-3 py-2 text-sm shadow-sm backdrop-blur"
        >
          <span>{reconnectStatus === 'syncing' ? '连接已恢复，正在同步最新消息…' : '连接已恢复，但消息同步失败。'}</span>
          {reconnectStatus === 'error' ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7"
              onClick={() => {
                setReconnectStatus('syncing')
                void Promise.resolve(fetchUpdates()).then(
                  () => setReconnectStatus('idle'),
                  () => setReconnectStatus('error'),
                )
              }}
            >
              重试同步
            </Button>
          ) : null}
        </div>
      ) : null}
      {threadAttachments.length > 0 ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="absolute left-1/2 top-3 z-10 h-8 -translate-x-1/2 gap-1.5 rounded-full bg-background/95 px-3 shadow-sm backdrop-blur"
          onClick={() => setAttachmentsOpen(true)}
          aria-label={`查看会话附件，共 ${threadAttachments.length} 个`}
        >
          <Paperclip className="size-3.5" />
          附件 {threadAttachments.length}
        </Button>
      ) : null}
      <Dialog open={attachmentsOpen} onOpenChange={setAttachmentsOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>会话附件</DialogTitle>
            <DialogDescription>附件保存在当前空间，可以预览、打开或下载。</DialogDescription>
          </DialogHeader>
          <div className="grid max-h-[60vh] grid-cols-1 gap-3 overflow-y-auto sm:grid-cols-2">
            {threadAttachments.map((attachment) => {
              const objectUrl = attachment.download_url ?? attachment.preview_url
              return (
                <div key={attachment.id} className="overflow-hidden rounded-xl border bg-muted/20">
                  {attachment.type === 'image' && attachment.preview_url ? (
                    <button
                      type="button"
                      className="block aspect-video w-full overflow-hidden bg-muted text-left"
                      onClick={() => setPreviewAttachment(attachment)}
                      aria-label={`打开图片 ${attachment.name}`}
                    >
                      <img src={attachment.preview_url} alt={attachment.name} className="size-full object-cover" />
                    </button>
                  ) : (
                    <div className="flex aspect-video items-center justify-center bg-muted text-muted-foreground">
                      <Paperclip className="size-8" />
                    </div>
                  )}
                  <div className="flex items-center gap-2 p-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{attachment.name}</p>
                      <p className="truncate text-xs text-muted-foreground">{attachment.mime_type}</p>
                    </div>
                    {objectUrl ? (
                      <>
                        {attachment.type === 'image' ? (
                          <Button type="button" variant="ghost" size="icon" onClick={() => setPreviewAttachment(attachment)} aria-label={`打开 ${attachment.name}`}>
                            <ExternalLink className="size-4" />
                          </Button>
                        ) : (
                          <Button type="button" variant="ghost" size="icon" asChild>
                            <a href={objectUrl} target="_blank" rel="noopener noreferrer" aria-label={`打开 ${attachment.name}`}>
                              <ExternalLink className="size-4" />
                            </a>
                          </Button>
                        )}
                        <Button type="button" variant="ghost" size="icon" asChild>
                          <a href={objectUrl} download={attachment.name} aria-label={`下载 ${attachment.name}`}>
                            <Download className="size-4" />
                          </a>
                        </Button>
                      </>
                    ) : null}
                  </div>
                </div>
              )
            })}
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={Boolean(previewAttachment)} onOpenChange={(open) => !open && setPreviewAttachment(null)}>
        <DialogContent className="max-w-5xl">
          <DialogHeader>
            <DialogTitle>{previewAttachment?.name}</DialogTitle>
            <DialogDescription>图片保存在当前空间。</DialogDescription>
          </DialogHeader>
          {previewAttachment?.preview_url ? (
            <div className="flex max-h-[75vh] items-center justify-center overflow-auto rounded-xl bg-muted/40 p-2">
              <img src={previewAttachment.preview_url} alt={previewAttachment.name} className="max-h-[72vh] max-w-full object-contain" />
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
      {sendDisabled || !isOnline ? (
        <div className="absolute inset-x-0 bottom-0 z-10 flex min-h-24 items-center justify-center border-t border-warning/20 bg-background/95 px-4 text-sm text-muted-foreground">
          {isOnline ? '空间连接恢复后可继续发送' : '网络恢复后可继续发送'}
        </div>
      ) : null}
    </div>
  )
}

export function ChatContentPane(props: ChatContentPaneProps) {
  const compact = props.compact === true
  const { session } = useSession()
  const {
    db,
    status: databaseStatus,
    error: databaseError,
    retry: retryDatabase,
    scopeKey: databaseScopeKey,
  } = useSolidDatabase()
  const { isReady } = useChatInit()
  const selectedChatId = useChatStore((state) => state.selectedChatId)
  const selectedThreadId = useChatStore((state) => state.selectedThreadId)
  const selectThread = useChatStore((state) => state.selectThread)
  const {
    data: chats,
    isLoading: isChatsLoading,
    error: chatError,
    refetch: refetchChats,
  } = useChatList()
  const {
    data: threads = [],
    isLoading: isThreadsLoading,
    error: threadError,
    refetch: refetchThreads,
  } = useThreadList(selectedChatId || '', {
    enabled: !!selectedChatId,
  })
  const mutations = useChatMutations()
  const isCreatingThreadRef = useRef(false)
  const lastAutoCreateThreadChatRef = useRef<string | null>(null)
  const threadCreationAttemptRef = useRef(0)
  const [threadCreationFailure, setThreadCreationFailure] = useState<ScopedSecretaryError | null>(null)
  const [threadCreationRetryKey, setThreadCreationRetryKey] = useState(0)
  const [secretaryDraftState, setSecretaryDraftState] = useState<ScopedSecretaryDraft>({
    text: '',
    scopeKey: '',
  })
  const [pendingSecretaryDraft, setPendingSecretaryDraft] = useState<PendingSecretaryDraft | null>(null)
  const [secretaryDraftHandoffFailure, setSecretaryDraftHandoffFailure] = useState<ScopedSecretaryError | null>(null)
  const isDefaultSecretarySettling = useLinxDefaultSecretaryBootstrapSettling()
  const isSecretary = selectedChatId === LINX_DEFAULT_SECRETARY.chatId
  const secretaryScopeKey = `${databaseScopeKey}:${session.info.webId ?? 'logged-out'}`
  const secretaryDraftScope: ChatDraftScope = {
    accountScope: secretaryScopeKey,
    chatId: LINX_DEFAULT_SECRETARY.chatId,
  }
  const activeSecretaryScopeRef = useRef(secretaryScopeKey)
  activeSecretaryScopeRef.current = secretaryScopeKey
  const activeSelectedChatRef = useRef(selectedChatId)
  activeSelectedChatRef.current = selectedChatId
  const secretaryDraft = secretaryDraftState.scopeKey === secretaryScopeKey
    ? secretaryDraftState.text
    : ''
  const activePendingSecretaryDraft = pendingSecretaryDraft?.scopeKey === secretaryScopeKey
    ? pendingSecretaryDraft
    : null
  const threadCreationError = threadCreationFailure?.scopeKey === secretaryScopeKey
    && threadCreationFailure.chatId === selectedChatId
    ? threadCreationFailure.message
    : null
  const secretaryDraftHandoffError = secretaryDraftHandoffFailure?.scopeKey === secretaryScopeKey
    && secretaryDraftHandoffFailure.chatId === selectedChatId
    ? secretaryDraftHandoffFailure.message
    : null

  useEffect(() => {
    setThreadCreationFailure(null)
    setPendingSecretaryDraft(null)
    setSecretaryDraftHandoffFailure(null)
    setSecretaryDraftState({
      text: loadChatDraft(secretaryDraftScope),
      scopeKey: secretaryScopeKey,
    })
  }, [secretaryScopeKey])

  useEffect(() => {
    lastAutoCreateThreadChatRef.current = null
    isCreatingThreadRef.current = false
    threadCreationAttemptRef.current += 1
  }, [selectedChatId])

  const retryThreadCreation = useCallback(() => {
    lastAutoCreateThreadChatRef.current = null
    setThreadCreationFailure(null)
    setThreadCreationRetryKey((current) => current + 1)
  }, [])

  const retryContentQueries = useCallback(() => {
    if (databaseStatus !== 'ready' || !db) {
      retryDatabase()
      return
    }
    void Promise.all([refetchChats(), refetchThreads()])
  }, [databaseStatus, db, refetchChats, refetchThreads, retryDatabase])

  const submitSecretaryDraft = useCallback(() => {
    const text = secretaryDraft.trim()
    if (!text || !selectedChatId || !session.info.webId) return

    setPendingSecretaryDraft({
      text,
      attempt: 0,
      chatId: selectedChatId,
      scopeKey: secretaryScopeKey,
    })
    setSecretaryDraftHandoffFailure(null)
    retryThreadCreation()
  }, [retryThreadCreation, secretaryDraft, secretaryScopeKey, selectedChatId, session.info.webId])

  const retrySecretaryDraftHandoff = useCallback(() => {
    setSecretaryDraftHandoffFailure(null)
    setPendingSecretaryDraft((current) => current
      && current.scopeKey === secretaryScopeKey
      ? { ...current, attempt: current.attempt + 1 }
      : current)
  }, [secretaryScopeKey])

  const completeSecretaryDraftHandoff = useCallback((draft: PendingSecretaryDraft) => {
    setPendingSecretaryDraft((current) => current === draft ? null : current)
    setSecretaryDraftState((current) => current.scopeKey === draft.scopeKey
      ? { text: '', scopeKey: draft.scopeKey }
      : current)
    setSecretaryDraftHandoffFailure((current) => current?.scopeKey === draft.scopeKey ? null : current)
    clearChatDraft({
      accountScope: draft.scopeKey,
      chatId: LINX_DEFAULT_SECRETARY.chatId,
    })
  }, [])

  const updateSecretaryDraft = useCallback((text: string) => {
    setSecretaryDraftState({ text, scopeKey: secretaryScopeKey })
    saveChatDraft(secretaryDraftScope, text)
  }, [secretaryScopeKey])

  const failSecretaryDraftHandoff = useCallback((draft: PendingSecretaryDraft) => {
    if (activeSecretaryScopeRef.current !== draft.scopeKey) return
    setSecretaryDraftHandoffFailure({
      message: '无法将草稿填入当前话题。草稿仍保留，可重试。',
      scopeKey: draft.scopeKey,
      chatId: draft.chatId,
    })
  }, [])

  const activeChat = useMemo(() => {
    if (!selectedChatId || !chats) return null
    return chats.find((chat) => chat.id === selectedChatId) ?? null
  }, [chats, selectedChatId])

  const activeThread = useMemo(() => {
    if (!selectedThreadId) return null
    return threads.find((thread) => thread.id === selectedThreadId) ?? null
  }, [selectedThreadId, threads])
  const isStagedSecretaryWelcome = isSecretary && !activeThread
  const isWaitingForChat = isChatsLoading && !activeChat
  const isWaitingForThread = isThreadsLoading && !selectedThreadId

  useEffect(() => {
    const canUseStagedSecretary = isSecretary
    if (
      !selectedChatId
      || !isReady
      || (!activeChat && !canUseStagedSecretary)
      || (!canUseStagedSecretary && (isChatsLoading || isThreadsLoading || chatError || threadError))
    ) return

    const normalizedThreads = threads
      .map((thread) => ({ ...thread, _id: thread.id }))
      .filter((thread) => Boolean(thread._id))

    if (selectedThreadId && normalizedThreads.some((thread) => thread._id === selectedThreadId)) {
      return
    }

    if (normalizedThreads.length > 0) {
      setThreadCreationFailure(null)
      selectThread(normalizedThreads[0]._id)
      return
    }

    if (isSecretary && isDefaultSecretarySettling) {
      return
    }

    if (
      isCreatingThreadRef.current
      || mutations.createThread.isPending
      || lastAutoCreateThreadChatRef.current === selectedChatId
    ) {
      return
    }

    isCreatingThreadRef.current = true
    lastAutoCreateThreadChatRef.current = selectedChatId
    const creationScopeKey = secretaryScopeKey
    const creationChatId = selectedChatId
    const creationAttempt = ++threadCreationAttemptRef.current
    mutations.createThread.mutate(
      {
        chatId: selectedChatId,
        title: '默认话题',
      },
      {
        onSuccess: (thread) => {
          if (
            activeSecretaryScopeRef.current !== creationScopeKey
            || activeSelectedChatRef.current !== creationChatId
            || threadCreationAttemptRef.current !== creationAttempt
          ) {
            return
          }
          setThreadCreationFailure(null)
          const threadId = thread.id
          if (threadId) {
            selectThread(threadId)
            void mutations.ensureThreadWorkspace.mutateAsync({
              threadId,
              title: '默认话题',
            }).catch((error) => {
              console.error('Bind default Pod workspace failed:', error)
            })
          }
          isCreatingThreadRef.current = false
        },
        onError: (error) => {
          if (
            activeSecretaryScopeRef.current === creationScopeKey
            && activeSelectedChatRef.current === creationChatId
            && threadCreationAttemptRef.current === creationAttempt
          ) {
            setThreadCreationFailure({
              message: error instanceof Error ? error.message : '创建话题失败',
              scopeKey: creationScopeKey,
              chatId: creationChatId,
            })
            isCreatingThreadRef.current = false
          }
        },
      },
    )
  }, [
    isDefaultSecretarySettling,
    isReady,
    isSecretary,
    isChatsLoading,
    isThreadsLoading,
    chatError,
    threadError,
    activeChat,
    mutations.createThread,
    mutations.ensureThreadWorkspace,
    selectedChatId,
    selectedThreadId,
    secretaryScopeKey,
    selectThread,
    threadCreationRetryKey,
    threads,
  ])

  const isAuthenticated = Boolean(session.info.webId && session.fetch)
  const rawContentState = projectChatContentState({
    isAuthenticated,
    isLoading: !isReady
      || !db
      || isWaitingForChat
      || isWaitingForThread
      || (!isSecretary && !selectedThreadId && !threadCreationError),
    isChatLoading: !db || databaseStatus === 'initializing' || isWaitingForChat,
    error: databaseStatus === 'error'
      ? databaseError ?? new Error('Solid database initialization failed.')
      : isStagedSecretaryWelcome ? null : chatError ?? threadError,
    activeChat,
    isSecretary,
    hasThread: Boolean(selectedThreadId && (activeThread || (!chatError && !threadError))),
  })
  const isErrorDerivedLoginRequired = rawContentState.kind === 'login-required' && isAuthenticated
  const [loginRequiredGraceExpired, setLoginRequiredGraceExpired] = useState(false)

  useEffect(() => {
    if (!isErrorDerivedLoginRequired) {
      setLoginRequiredGraceExpired(false)
      return
    }
    const retryTimer = window.setTimeout(() => retryContentQueries(), LOGIN_REQUIRED_RETRY_DELAY_MS)
    const graceTimer = window.setTimeout(() => setLoginRequiredGraceExpired(true), LOGIN_REQUIRED_GRACE_MS)
    return () => {
      window.clearTimeout(retryTimer)
      window.clearTimeout(graceTimer)
    }
  }, [isErrorDerivedLoginRequired, retryContentQueries])

  const contentState: ChatContentState = isErrorDerivedLoginRequired && !loginRequiredGraceExpired
    ? { kind: 'loading', recoverable: true }
    : rawContentState
  const readyWarning = contentState.kind === 'ready' && databaseStatus === 'error'
    ? {
        title: '当前空间连接已失效',
        description: '当前显示缓存内容。恢复空间连接后才能继续发送。',
        actionLabel: '重试连接',
      }
    : contentState.kind === 'ready' && (databaseStatus !== 'ready' || !db)
      ? {
          title: '正在恢复当前空间连接',
          description: '当前显示缓存内容。空间连接恢复前暂时不能发送。',
          actionLabel: '重试连接',
        }
      : contentState.kind === 'ready' && (chatError || threadError) && !isStagedSecretaryWelcome
      ? {
          title: '聊天同步失败，当前显示缓存内容',
          description: '可以继续查看和输入；重试后会刷新当前聊天。',
          actionLabel: '重试同步',
        }
      : null

  if (!selectedChatId) {
    if (compact) {
      return (
        <div className="flex min-h-0 flex-1" aria-label="聊天列表">
          <ChatListPane {...props} />
        </div>
      )
    }
    return (
      <div className="flex min-h-0 flex-1">
        <EmptyState title="选择或创建一个聊天" description="先打开一个会话，再为它绑定运行时与文件夹。" />
      </div>
    )
  }

  if (contentState.kind === 'login-required') {
    return <EmptyState title="登录未完成" description="请先完成登录，再开始聊天。" />
  }

  if (contentState.kind === 'welcome') {
    const composerStatus = threadCreationError
      ? '默认话题暂未创建，草稿已保留。重试后可以继续。'
      : activePendingSecretaryDraft
        ? '草稿已保留，将在默认话题准备好后填入输入框。'
      : isDefaultSecretarySettling || !isReady || !db || isChatsLoading || isThreadsLoading
        ? '可以立即开始；对话记录会在空间准备好后同步。'
        : '准备就绪；发送后将进入默认话题。'

    return (
      <SecretaryWelcome
        starterActions={SECRETARY_STARTER_ACTIONS}
        composerValue={secretaryDraft}
        composerStatus={composerStatus}
        onStarterAction={(action) => updateSecretaryDraft(action.prompt)}
        onComposerValueChange={updateSecretaryDraft}
        onSubmit={submitSecretaryDraft}
        isSubmitting={mutations.createThread.isPending || Boolean(activePendingSecretaryDraft)}
        retryLabel={threadCreationError ? '重试创建话题' : undefined}
        onRetry={threadCreationError ? retryThreadCreation : undefined}
      />
    )
  }

  if (threadCreationError && !selectedThreadId) {
    return (
      <EmptyState
        title="无法创建默认话题"
        description={`${threadCreationError}。请检查当前空间后重试。`}
        action={<Button variant="outline" size="sm" onClick={retryThreadCreation}>重试</Button>}
      />
    )
  }

  if (contentState.kind === 'loading') {
    if (!isReady) {
      return <EmptyState title="正在连接空间" description="正在准备账号和数据访问，请稍等。" />
    }
    if (!db) {
      return <EmptyState title="数据还没准备好" description="正在准备当前空间的数据访问。" />
    }
    return <EmptyState title="正在加载聊天" description="正在从当前空间读取聊天内容。" />
  }

  if (contentState.kind !== 'ready') {
    const copy = CONTENT_FAILURE_COPY[contentState.kind] ?? CONTENT_FAILURE_COPY.unavailable!
    return (
      <EmptyState
        title={copy.title}
        description={copy.description}
        action={contentState.recoverable
          ? <Button variant="outline" size="sm" onClick={retryContentQueries}>重试</Button>
          : undefined}
      />
    )
  }

  if (!selectedThreadId || !activeChat) {
    return <EmptyState title="正在加载聊天" description="正在同步当前聊天与话题状态。" />
  }

  return (
    <div className="flex h-full flex-1 overflow-hidden bg-background">
      <div data-testid="chat-workspace-surface" className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
        <RuntimeSessionToolbar
          threadId={selectedThreadId}
          threadTitle={activeThread?.title ?? '默认话题'}
          workspaceUri={activeThread?.workspace}
        />
        <InboxActionBanner chatId={selectedChatId} threadId={selectedThreadId} />
        {readyWarning ? (
          <div role="alert" className="flex items-center justify-between gap-3 border-b border-warning/20 bg-warning/5 px-4 py-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">{readyWarning.title}</p>
              <p className="mt-1 text-xs text-muted-foreground">{readyWarning.description}</p>
            </div>
            <Button variant="outline" size="sm" className="h-8 shrink-0" onClick={retryContentQueries}>
              {readyWarning.actionLabel}
            </Button>
          </div>
        ) : null}
        {secretaryDraftHandoffError ? (
          <div role="alert" className="flex items-center justify-between gap-3 border-b border-destructive/20 bg-destructive/5 px-4 py-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">无法填入 Secretary 草稿</p>
              <p className="mt-1 text-xs text-muted-foreground">{secretaryDraftHandoffError}</p>
            </div>
            <Button variant="outline" size="sm" className="h-8 shrink-0" onClick={retrySecretaryDraftHandoff}>
              重试填入草稿
            </Button>
          </div>
        ) : null}
        <div className="min-h-0 flex-1 overflow-hidden">
          <ChatKitPanel
            session={session}
            selectedThreadId={selectedThreadId}
            selectedChatId={selectedChatId}
            selectedThreadTitle={activeThread?.title}
            pendingComposerDraft={isSecretary
              && activePendingSecretaryDraft?.chatId === selectedChatId
              ? activePendingSecretaryDraft
              : null}
            onComposerDraftApplied={completeSecretaryDraftHandoff}
            onComposerDraftError={failSecretaryDraftHandoff}
            sendDisabled={databaseStatus !== 'ready' || !db}
          />
        </div>
      </div>
    </div>
  )
}
