/**
 * ChatContentPane - AI 聊天内容面板
 *
 * 使用 OpenAI ChatKit SDK 作为主交互层。
 * Pod 负责留档；当本地 service 中存在运行时会话时，
 * ChatKit 的 assistant 响应会经由 runtime 转发并流式返回。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSession } from '@inrupt/solid-ui-react'
import { useNavigate } from '@tanstack/react-router'
import { Bot, Loader2, LockKeyhole, PlayCircle, ShieldAlert } from 'lucide-react'
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
import { DEFAULT_LINX_PLATFORM_MODEL_ID, LINX_PLATFORM_MODEL_IDS } from '@/lib/agent-providers'
import { createLocalChatKitFetch } from '../services/chatkit-local/fetch-handler'
import { useChatStore } from '../store'
import {
  useChatInit,
  useChatList,
  useChatMutations,
  useThreadList,
  useWorkspaceList,
  useLinxDefaultSecretaryBootstrapSettling,
  LINX_DEFAULT_SECRETARY,
} from '../collections'
import { SessionControlBar, type SessionStatus } from './SessionControlBar'
import {
  fetchRuntimeSessionLog,
  isRuntimeSessionMode,
  resolveLocalWorkspaceUri,
  useRuntimeSession,
  useRuntimeSessionEvents,
  type RuntimeSessionEvent,
  type RuntimeToolType,
} from '../runtime-client'
import { buildWorkspaceSummary } from '../workspace-summary'
import { restoreChatMessageAnchor } from '../message-anchor'

export interface ChatContentPaneProps extends MicroAppPaneProps {}

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex flex-1 items-center justify-center bg-muted/30">
      <div className="max-w-sm px-6 text-center">
        <Bot className="mx-auto mb-4 h-16 w-16 text-muted-foreground/20" />
        <p className="mb-2 font-medium text-foreground">{title}</p>
        <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>
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
    <div className="flex items-center justify-between gap-3 border-b border-amber-500/20 bg-amber-500/5 px-4 py-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
          <Icon className="h-4 w-4 text-amber-600" />
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

  const handleRuntimeSessionEvent = useCallback((event: RuntimeSessionEvent) => {
    if (event.type === 'status' || event.type === 'exit') {
      setRuntimeError(null)
      void runtimeSession.refetch()
      return
    }

    if (event.type === 'error') {
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
          workspaceUri: boundPodWorkspaceUri,
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

      const requestedWorkspaceUri = await resolveLocalWorkspaceUri(normalizedFolderPath)
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
        workspaceUri: resolvedWorkspaceUri,
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

function ChatKitPanel({ session, selectedThreadId }: { session: any; selectedThreadId: string }) {
  const selectThread = useChatStore((state) => state.selectThread)
  const messageAnchorId = useChatStore((state) => state.messageAnchorId)
  const clearMessageAnchor = useChatStore((state) => state.clearMessageAnchor)
  const theme = useThemeMode()
  const { db } = useSolidDatabase()
  const chatKitHostRef = useRef<(HTMLElement & { setThreadId?: (threadId: string | null) => Promise<void> | void }) | null>(null)

  const localFetch = useMemo(() => {
    if (!db || !session.info.webId || !session.fetch) return session.fetch
    return createLocalChatKitFetch({ db, webId: session.info.webId, authFetch: session.fetch })
  }, [db, session.fetch, session.info.webId])

  const chatkit = useChatKit({
    api: {
      url: 'local://chatkit',
      domainKey: 'local',
      fetch: localFetch,
    },
    initialThread: selectedThreadId,
    theme: {
      colorScheme: theme,
      color: {
        accent: {
          primary: '#7C3AED',
          level: 2,
        },
      },
    },
    header: { enabled: false },
    history: { enabled: false },
    composer: {
      placeholder: '输入消息...',
      models: LINX_PLATFORM_MODEL_IDS.map((modelId) => ({
        id: modelId,
        label: modelId === 'linx-lite' ? 'LinX Lite' : 'LinX',
        default: modelId === DEFAULT_LINX_PLATFORM_MODEL_ID,
      })),
    },
    threadItemActions: { feedback: true, retry: true },
    onThreadChange: ({ threadId }: { threadId: string | null }) => {
      if (threadId) {
        selectThread(threadId)
      }
    },
    onError: ({ error }: { error: Error }) => {
      console.error('[ChatKit] Error:', error)
    },
  })

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
    <div className="h-full flex-1 overflow-hidden">
      <ChatKitComponent
        ref={chatKitHostRef as any}
        control={chatkit.control}
        style={{ display: 'block', width: '100%', height: '100%' }}
      />
    </div>
  )
}

export function ChatContentPane(_props: ChatContentPaneProps) {
  const { session } = useSession()
  const { db } = useSolidDatabase()
  const { isReady } = useChatInit()
  const selectedChatId = useChatStore((state) => state.selectedChatId)
  const selectedThreadId = useChatStore((state) => state.selectedThreadId)
  const selectThread = useChatStore((state) => state.selectThread)
  const { data: chats } = useChatList()
  const { data: threads = [], isLoading: isThreadsLoading } = useThreadList(selectedChatId || '', {
    enabled: !!selectedChatId,
  })
  const mutations = useChatMutations()
  const isCreatingThreadRef = useRef(false)
  const lastAutoCreateThreadChatRef = useRef<string | null>(null)
  const isDefaultSecretarySettling = useLinxDefaultSecretaryBootstrapSettling()

  useEffect(() => {
    lastAutoCreateThreadChatRef.current = null
  }, [selectedChatId])

  const activeChat = useMemo(() => {
    if (!selectedChatId || !chats) return null
    return chats.find((chat) => chat.id === selectedChatId) ?? null
  }, [chats, selectedChatId])

  const activeThread = useMemo(() => {
    if (!selectedThreadId) return null
    return threads.find((thread) => thread.id === selectedThreadId) ?? null
  }, [selectedThreadId, threads])

  useEffect(() => {
    if (!selectedChatId || !isReady || isThreadsLoading) return

    const normalizedThreads = threads
      .map((thread) => ({ ...thread, _id: thread.id }))
      .filter((thread) => Boolean(thread._id))

    if (selectedThreadId && normalizedThreads.some((thread) => thread._id === selectedThreadId)) {
      return
    }

    if (normalizedThreads.length > 0) {
      selectThread(normalizedThreads[0]._id)
      return
    }

    if (selectedChatId === LINX_DEFAULT_SECRETARY.chatId && isDefaultSecretarySettling) {
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
    mutations.createThread.mutate(
      {
        chatId: selectedChatId,
        title: '默认话题',
      },
      {
        onSuccess: (thread) => {
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
          console.error('Create default thread failed:', error)
          isCreatingThreadRef.current = false
        },
      },
    )
  }, [
    isDefaultSecretarySettling,
    isReady,
    isThreadsLoading,
    mutations.createThread,
    mutations.ensureThreadWorkspace,
    selectedChatId,
    selectedThreadId,
    selectThread,
    threads,
  ])

  if (!selectedChatId) {
    return <EmptyState title="选择或创建一个聊天" description="先打开一个会话，再为它绑定运行时与文件夹。" />
  }

  if (!isReady) {
    return <EmptyState title="正在连接空间" description="正在准备账号和数据访问，请稍等。" />
  }

  if (!session.info.webId || !session.fetch) {
    return <EmptyState title="登录未完成" description="请先完成登录，再开始聊天。" />
  }

  if (!db) {
    return <EmptyState title="数据还没准备好" description="正在准备当前空间的数据访问。" />
  }

  if (!activeChat) {
    return <EmptyState title="正在加载聊天" description="正在从当前空间读取聊天内容。" />
  }

  if (!selectedThreadId) {
    return (
      <div className="flex flex-1 items-center justify-center bg-muted/30">
        <div className="text-center text-muted-foreground">
          <Loader2 className="mx-auto mb-3 h-6 w-6 animate-spin" />
          <p className="text-sm">正在准备话题...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-1 overflow-hidden bg-muted/30">
      <div className="m-4 flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-border/50 bg-background/80 backdrop-blur-sm">
        <RuntimeSessionToolbar
          threadId={selectedThreadId}
          threadTitle={activeThread?.title ?? '默认话题'}
          workspaceUri={activeThread?.workspace}
        />
        <InboxActionBanner chatId={selectedChatId} threadId={selectedThreadId} />
        <div className="min-h-0 flex-1 overflow-hidden">
          <ChatKitPanel session={session} selectedThreadId={selectedThreadId} />
        </div>
      </div>
    </div>
  )
}
