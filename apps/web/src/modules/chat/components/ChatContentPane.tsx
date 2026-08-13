/**
 * ChatContentPane - AI 聊天内容面板
 *
 * 使用 OpenAI ChatKit SDK 作为主交互层。
 * Pod 负责留档；当本地 service 中存在运行时会话时，
 * ChatKit 的 assistant 响应会经由 runtime 转发并流式返回。
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useSession } from '@/providers/solid-session-context'
import { requestSessionRecovery } from '@/modules/login/login-utils'
import { useNavigate } from '@tanstack/react-router'
import { ArrowLeft, ArrowRight, Bot, Brain, Camera, Download, ExternalLink, FileOutput, FolderOpen, LockKeyhole, Mic, Paperclip, Pencil, PlayCircle, Quote, RefreshCw, Share2, ShieldAlert, Square, Trash2, Volume2, WifiOff } from 'lucide-react'
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
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { useInboxItems } from '@/modules/inbox/collections'
import { isActionableInboxItem } from '@/modules/inbox/utils'
import { useInboxStore } from '@/modules/inbox/store'
import { useSolidDatabase } from '@/providers/solid-database-provider'
import { formatLoginErrorForUser } from '@/modules/login/error-messages'
import { createLocalChatKitFetch, unavailableResponse, type LocalChatKitFetch } from '../services/chatkit-local/fetch-handler'
import type { Attachment, ThreadItem } from '@/lib/vendor/xpod-chatkit'
import { useChatStore } from '../store'
import {
  useChatInit,
  useChatList,
  useChatMutations,
  useThreadList,
  useMessageList,
  useMessageIndex,
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
  type RuntimeEventConnectionState,
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
import { readMessageBranchMetadata } from '../domain/message-row-adapter'
import { cycleSibling, groupMessageSiblings, selectSiblingIndex } from '../domain/message-tree'
import { classifyRuntimeTool } from '../domain/runtime-tool-category'
import { resolveCurrentPodBaseUrl } from '@/lib/data/current-pod-base'
import { projectChatArtifactVersions } from '@/modules/files/domain/list/chat-files-projection'
import { ArtifactWorkspace } from './ArtifactWorkspace'
import { ConversationShareDialog } from './ConversationShareDialog'
import { ProjectContextDialog } from './ProjectContextDialog'
import { MultimodalCaptureDialog } from './MultimodalCaptureDialog'
import { VoiceConversationDialog } from './VoiceConversationDialog'
import { speakText } from '../domain/speech-output'
import { projectChatAssets } from '../domain/chat-asset-library'
import { probeChatConnectivity } from '../domain/chat-connectivity'
import { ChatAssetLibraryDialog } from './ChatAssetLibraryDialog'
import { threadRepository } from '@undefineds.co/models'

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

export function chatThreadRefsMatch(left: string | null | undefined, right: string | null | undefined): boolean {
  if (!left || !right) return false
  if (left === right) return true
  if (left.includes('#') && right.includes('#')) return false
  const fragment = (value: string) => value.includes('#') ? value.slice(value.lastIndexOf('#') + 1) : value
  return fragment(left) === fragment(right)
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

export function readActiveBranchSelections(metadata: unknown): Record<string, string> {
  let value = metadata
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value)
    } catch {
      return {}
    }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  let active = (value as Record<string, unknown>).active_branch_by_parent
  if (typeof active === 'string') {
    try {
      active = JSON.parse(active)
    } catch {
      return {}
    }
  }
  if (!active || typeof active !== 'object' || Array.isArray(active)) return {}
  return Object.fromEntries(
    Object.entries(active as Record<string, unknown>)
      .filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
  )
}

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

function assistantItemText(item: ThreadItem): string {
  if (item.type !== 'assistant_message') return ''
  return item.content
    .flatMap((part) => part.type === 'output_text' && typeof part.text === 'string' ? [part.text] : [])
    .join('\n')
    .trim()
}

interface RuntimeActivity {
  label: string
  technicalName?: string
  tone: 'running' | 'waiting'
}

function describeRuntimeTool(name: string): RuntimeActivity {
  switch (classifyRuntimeTool(name)) {
    case 'search':
      return { label: '正在搜索相关资料', technicalName: name, tone: 'running' }
    case 'read':
      return { label: '正在读取工作区内容', technicalName: name, tone: 'running' }
    case 'write':
      return { label: '等待确认工作区变更', technicalName: name, tone: 'waiting' }
    case 'execute':
      return { label: '正在运行工作区命令', technicalName: name, tone: 'running' }
    default:
      return { label: '正在使用工作区工具', technicalName: name, tone: 'running' }
  }
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
  const [runtimeConnectionState, setRuntimeConnectionState] = useState<RuntimeEventConnectionState>('connected')
  const refetchRuntimeSession = runtimeSession.refetch

  const handleRuntimeSessionEvent = useCallback((event: RuntimeSessionEvent) => {
    if (event.type === 'status' || event.type === 'exit') {
      setRuntimeError(null)
      if (event.type === 'exit' || event.status !== 'active') setRuntimeActivity(null)
      void refetchRuntimeSession()
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
      void refetchRuntimeSession()
    }
  }, [refetchRuntimeSession])

  useRuntimeSessionEvents(
    runtimeSession.runtimeSession?.id,
    handleRuntimeSessionEvent,
    !!runtimeSession.runtimeSession,
    setRuntimeConnectionState,
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
          {runtimeConnectionState === 'reconnecting' ? (
            <div role="status" className="border-b border-warning/20 bg-warning/5 px-4 py-2 text-xs text-muted-foreground">
              运行时连接已中断，正在自动恢复…
            </div>
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
  selectedWorkspaceUri,
  persistedActiveBranchByParent,
  pendingComposerDraft,
  onComposerDraftApplied,
  onComposerDraftError,
  sendDisabled,
}: {
  session: any
  selectedThreadId: string
  selectedChatId: string
  selectedThreadTitle?: string
  selectedWorkspaceUri?: string | null
  persistedActiveBranchByParent?: Record<string, string>
  pendingComposerDraft: PendingSecretaryDraft | null
  onComposerDraftApplied: (draft: PendingSecretaryDraft) => void
  onComposerDraftError: (draft: PendingSecretaryDraft, error: unknown) => void
  sendDisabled: boolean
}) {
  const sessionFetch = session.fetch
  const sessionWebId = session.info.webId
  const selectThread = useChatStore((state) => state.selectThread)
  const messageAnchorId = useChatStore((state) => state.messageAnchorId)
  const clearMessageAnchor = useChatStore((state) => state.clearMessageAnchor)
  const setActiveBranch = useChatStore((state) => state.setActiveBranch)
  const localActiveBranchByParent = useChatStore((state) => state.activeBranchByParent)
  const theme = useThemeMode()
  const { db } = useSolidDatabase()
  const [threadAttachments, setThreadAttachments] = useState<Attachment[]>([])
  const [branchThreadItems, setBranchThreadItems] = useState<ThreadItem[]>([])
  const [attachmentsOpen, setAttachmentsOpen] = useState(false)
  const [artifactsOpen, setArtifactsOpen] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const [projectContextOpen, setProjectContextOpen] = useState(false)
  const [captureOpen, setCaptureOpen] = useState(false)
  const [voiceOpen, setVoiceOpen] = useState(false)
  const [assetLibraryOpen, setAssetLibraryOpen] = useState(false)
  const [isReading, setIsReading] = useState(false)
  const [speechError, setSpeechError] = useState<string | null>(null)
  const [previewAttachment, setPreviewAttachment] = useState<Attachment | null>(null)
  const [loadingAttachmentId, setLoadingAttachmentId] = useState<string | null>(null)
  const [attachmentLoadError, setAttachmentLoadError] = useState<string | null>(null)
  const [isOnline, setIsOnline] = useState(true)
  const isOnlineRef = useRef(true)
  const [reconnectStatus, setReconnectStatus] = useState<'idle' | 'syncing' | 'error'>('idle')
  const [queuedGenerationCount, setQueuedGenerationCount] = useState(0)
  const [outboxRevision, setOutboxRevision] = useState(0)
  const [isChatKitMounted, setIsChatKitMounted] = useState(false)
  const [editingMessage, setEditingMessage] = useState<{ id: string; text: string } | null>(null)
  const [actionMessageId, setActionMessageId] = useState<string | null>(null)
  const [isGenerating, setIsGenerating] = useState(false)
  const [pendingRegenerateParentId, setPendingRegenerateParentId] = useState<string | null>(null)
  const abortGenerationRef = useRef<(() => void) | null>(null)
  const speechAbortRef = useRef<AbortController | null>(null)
  const sendAvailableRef = useRef(!sendDisabled)
  sendAvailableRef.current = !sendDisabled
  // `initialThread` is mount-only configuration. Updating it causes ChatKit to
  // rebuild its internal thread state, which discards the per-thread composer
  // inputs that ChatKit already keeps while the element remains mounted.
  // Subsequent navigation is handled by `setThreadId` below.
  const initialThreadIdRef = useRef(selectedThreadId)
  const restoredInitialThreadRef = useRef(false)
  const restoredChatIdRef = useRef<string | null>(null)
  const chatKitHostRef = useRef<HTMLElement | null>(null)
  const bindChatKitHost = useCallback((host: HTMLElement | null) => {
    chatKitHostRef.current = host
    setIsChatKitMounted(Boolean(host))
  }, [])

  const authFetchWithRecovery = useCallback(async (input: RequestInfo | URL, init?: RequestInit) => {
    if (!sessionFetch) throw new Error('当前空间连接尚未恢复')
    const response = await sessionFetch(input, init)
    if (response.status === 401) requestSessionRecovery()
    return response
  }, [sessionFetch])

  const localFetch = useMemo(() => {
    if (!db || !sessionWebId || !sessionFetch) {
      const unavailableFetch = (async () => unavailableResponse()) as unknown as LocalChatKitFetch
      unavailableFetch.refreshThreadItems = async () => undefined
      unavailableFetch.getOutboxSize = () => 0
      unavailableFetch.getOutboxRetryAt = () => null
      unavailableFetch.flushOutbox = async () => ({ completed: 0, pending: 0 })
      unavailableFetch.loadAttachmentObjectUrl = async () => {
        throw new Error('当前空间连接尚未恢复')
      }
      unavailableFetch.prepareAttachmentForReuse = async () => {
        throw new Error('当前空间连接尚未恢复')
      }
      unavailableFetch.saveArtifactVersion = async () => {
        throw new Error('当前空间连接尚未恢复')
      }
      unavailableFetch.dispose = () => undefined
      return unavailableFetch
    }
    return createLocalChatKitFetch({
      db,
      webId: sessionWebId,
      authFetch: authFetchWithRecovery,
      initialThread: {
        id: selectedThreadId,
        title: selectedThreadTitle,
        status: { type: 'active' },
        created_at: Math.floor(Date.now() / 1000),
        updated_at: Math.floor(Date.now() / 1000),
        metadata: {
          chat_id: selectedChatId,
          ...(persistedActiveBranchByParent
            ? { active_branch_by_parent: persistedActiveBranchByParent }
            : {}),
        },
      },
      isAvailable: () => sendAvailableRef.current,
      onAttachmentsChange: setThreadAttachments,
      onStreamingChange: ({ active, abort }) => {
        abortGenerationRef.current = abort ?? null
        setIsGenerating(active)
      },
      onThreadItemsChange: setBranchThreadItems,
      onOutboxChange: (count) => {
        setQueuedGenerationCount(count)
        if (count > 0) setReconnectStatus((status) => status === 'idle' ? 'error' : status)
        setOutboxRevision((revision) => revision + 1)
      },
      onChatSummaryChange: ({ messageId, content, createdAt }) => {
        return projectChatSummary(selectedChatId, {
          lastMessageId: messageId,
          lastMessagePreview: content.slice(0, 100),
          lastActiveAt: createdAt,
          updatedAt: createdAt,
        })
      },
    })
  }, [authFetchWithRecovery, db, persistedActiveBranchByParent, selectedChatId, selectedThreadId, selectedThreadTitle, sessionFetch, sessionWebId])

  useEffect(() => {
    setThreadAttachments([])
    setPreviewAttachment(null)
    const queuedCount = localFetch.getOutboxSize()
    setQueuedGenerationCount(queuedCount)
    if (queuedCount > 0) setReconnectStatus('error')
    setOutboxRevision((revision) => revision + 1)
    return () => localFetch.dispose?.()
  }, [localFetch])

  const loadAttachmentForAction = useCallback(async (attachment: Attachment): Promise<Attachment | null> => {
    setLoadingAttachmentId(attachment.id)
    setAttachmentLoadError(null)
    try {
      const objectUrl = await localFetch.loadAttachmentObjectUrl(attachment.id)
      const loaded = {
        ...attachment,
        ...(attachment.type === 'image' ? { preview_url: objectUrl } : {}),
        download_url: objectUrl,
      }
      setThreadAttachments((current) => current.map((entry) => entry.id === loaded.id ? loaded : entry))
      return loaded
    } catch (error) {
      console.error('[ChatContentPane] Failed to load attachment:', error)
      setAttachmentLoadError('附件读取失败，请重试。')
      return null
    } finally {
      setLoadingAttachmentId(null)
    }
  }, [localFetch])

  const previewStoredAttachment = useCallback(async (attachment: Attachment) => {
    const loaded = attachment.preview_url ? attachment : await loadAttachmentForAction(attachment)
    if (loaded) setPreviewAttachment(loaded)
  }, [loadAttachmentForAction])

  const downloadStoredAttachment = useCallback(async (attachment: Attachment) => {
    const loaded = attachment.download_url ? attachment : await loadAttachmentForAction(attachment)
    if (!loaded?.download_url) return
    const anchor = document.createElement('a')
    anchor.href = loaded.download_url
    anchor.download = loaded.name
    anchor.click()
  }, [loadAttachmentForAction])

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
    initialThread: initialThreadIdRef.current,
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
    commands: { enabled: true },
    composer: {
      placeholder: '输入消息...',
      dictation: { enabled: true },
      tools: [
        {
          id: 'web_search',
          label: '联网搜索',
          shortLabel: '搜索',
          icon: 'search',
          pinned: true,
          persistent: false,
          placeholderOverride: '搜索网络并给出可点击的来源...',
        },
        {
          id: 'image_generation',
          label: '生成图片',
          shortLabel: '图片',
          icon: 'square-image',
          pinned: true,
          persistent: false,
          placeholderOverride: '描述希望生成的图片...',
        },
      ],
      attachments: {
        enabled: true,
        maxCount: 10,
        maxSize: 25 * 1024 * 1024,
        // Keep the composer aligned with the formats the local runtime can
        // persist and turn into model content. Other types should be added
        // only when their extraction path is available end to end.
        accept: {
          'image/*': ['.png', '.jpg', '.jpeg', '.gif', '.webp'],
          'application/pdf': ['.pdf'],
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
          'application/vnd.openxmlformats-officedocument.presentationml.presentation': ['.pptx'],
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
          'text/*': ['.txt', '.md', '.csv', '.json'],
          'application/json': ['.json'],
        },
      },
    },
    threadItemActions: { feedback: true, retry: true },
    thread: { autoScroll: true },
    // Restoration is gated by the mounted custom element below. The React
    // wrapper can attach this handler after a fast `chatkit.ready` event, so
    // the event alone is not a reliable page-refresh signal.
    onReady: () => setIsChatKitMounted(Boolean(chatKitHostRef.current)),
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
  const setThreadId = chatkit.setThreadId
  const fetchUpdates = chatkit.fetchUpdates
  const { data: messageRows = [], refetch: refetchMessages } = useMessageList(selectedChatId, selectedThreadId)
  const { data: allMessageRows = [] } = useMessageIndex({ enabled: Boolean(db) })
  const podBaseUrl = useMemo(() => db ? resolveCurrentPodBaseUrl(db) : null, [db])
  const chatAssets = useMemo(() => {
    return podBaseUrl ? projectChatAssets(allMessageRows, podBaseUrl) : []
  }, [allMessageRows, podBaseUrl])
  const selectedThreadUri = useMemo(() => {
    return podBaseUrl
      ? threadRepository.iriForChat(podBaseUrl, selectedChatId, selectedThreadId)
      : null
  }, [podBaseUrl, selectedChatId, selectedThreadId])
  const artifactVersions = useMemo(() => {
    return podBaseUrl
      ? projectChatArtifactVersions(messageRows, `${podBaseUrl}/`)
      : []
  }, [messageRows, podBaseUrl])
  const latestAssistantText = useMemo(() => {
    for (let index = branchThreadItems.length - 1; index >= 0; index -= 1) {
      const text = assistantItemText(branchThreadItems[index])
      if (text) return text
    }
    return ''
  }, [branchThreadItems])
  const toggleReadAloud = useCallback(() => {
    if (isReading) {
      speechAbortRef.current?.abort()
      speechAbortRef.current = null
      window.speechSynthesis?.cancel()
      setIsReading(false)
      return
    }
    if (!latestAssistantText) return
    const controller = new AbortController()
    speechAbortRef.current = controller
    setSpeechError(null)
    setIsReading(true)
    void speakText(latestAssistantText, controller.signal).catch((error) => {
      if (!(error instanceof DOMException && error.name === 'AbortError')) {
        setSpeechError(error instanceof Error ? error.message : '回答朗读失败。')
      }
    }).finally(() => {
      if (speechAbortRef.current === controller) speechAbortRef.current = null
      setIsReading(false)
    })
  }, [isReading, latestAssistantText])
  useEffect(() => () => {
    speechAbortRef.current?.abort()
    window.speechSynthesis?.cancel()
  }, [])
  const userMessages = useMemo(() => {
    const byId = new Map(messageRows
      .filter((message) => message.role === 'user')
      .map((message) => {
        let itemId = message.id
        if (typeof message.richContent === 'string') {
          try {
            const stored = JSON.parse(message.richContent) as { id?: unknown }
            if (typeof stored.id === 'string') itemId = stored.id
          } catch {
            // Legacy plain-text messages keep their Pod row id.
          }
        }
        return [itemId, { ...message, id: itemId }]
      }))
    for (const item of branchThreadItems) {
      if (item.type !== 'user_message') continue
      byId.set(item.id, {
        id: item.id,
        role: 'user',
        content: item.content
          .filter((part) => part.type === 'input_text')
          .map((part) => part.text)
          .join('\n'),
        richContent: JSON.stringify(item),
        createdAt: new Date(item.created_at * 1000),
      } as (typeof messageRows)[number])
    }
    return [...byId.values()].sort((left, right) => (
      new Date(left.createdAt ?? 0).getTime() - new Date(right.createdAt ?? 0).getTime()
    ))
  }, [branchThreadItems, messageRows])
  const lastUserMessage = userMessages[userMessages.length - 1]
  const actionMessage = userMessages.find((message) => message.id === actionMessageId) ?? lastUserMessage
  const branchNodes = useMemo(() => userMessages.map((row) => ({
    id: row.id,
    ...readMessageBranchMetadata(row),
    createdAt: row.createdAt,
  })), [userMessages])
  const branchGroups = useMemo(() => groupMessageSiblings(branchNodes), [branchNodes])
  useEffect(() => {
    for (const [parentId, itemId] of Object.entries(persistedActiveBranchByParent ?? {})) {
      setActiveBranch(parentId, itemId)
    }
  }, [persistedActiveBranchByParent, setActiveBranch])
  const activeBranchByParent = useMemo(() => ({
    ...(persistedActiveBranchByParent ?? {}),
    ...localActiveBranchByParent,
  }), [localActiveBranchByParent, persistedActiveBranchByParent])
  const persistedActionMessage = useMemo(
    () => [...userMessages]
      .reverse()
      .find((message) => Object.values(activeBranchByParent).includes(message.id)),
    [activeBranchByParent, userMessages],
  )
  const actionBranchGroup = useMemo(() => {
    if (!actionMessage) return null
    const metadata = readMessageBranchMetadata(actionMessage)
    return branchGroups.find((group) => group.items.some((item) => item.id === actionMessage.id))
      ?? (metadata.parentItemId ? branchGroups.find((group) => group.parentItemId === metadata.parentItemId) : null)
  }, [actionMessage, branchGroups])
  const actionBranchIndex = actionBranchGroup ? actionBranchGroup.items.findIndex((item) => item.id === actionMessage?.id) : -1
  const hasBranchSiblings = Boolean(actionBranchGroup && actionBranchGroup.items.length > 1 && actionMessage)
  const answerBranchGroup = useMemo(() => {
    if (!actionMessage) return null
    const canonicalUserId = (parentId: string | undefined) => {
      if (!parentId) return parentId
      const parentFragment = parentId.includes('#') ? parentId.slice(parentId.lastIndexOf('#') + 1) : parentId
      return userMessages.find((message) => {
        const messageFragment = message.id.includes('#') ? message.id.slice(message.id.lastIndexOf('#') + 1) : message.id
        return message.id === parentId || messageFragment === parentFragment
      })?.id ?? parentId
    }
    const answerNodes = branchThreadItems
      .filter((item) => item.type === 'assistant_message')
      .map((item) => ({
        id: item.id,
        parentItemId: typeof (item as ThreadItem & { parent_item_id?: unknown }).parent_item_id === 'string'
          ? canonicalUserId((item as ThreadItem & { parent_item_id: string }).parent_item_id)
          : undefined,
        branchId: typeof (item as ThreadItem & { branch_id?: unknown }).branch_id === 'string'
          ? (item as ThreadItem & { branch_id: string }).branch_id
          : undefined,
        createdAt: new Date(item.created_at * 1000),
      }))
    return groupMessageSiblings(answerNodes).find((group) => group.parentItemId === actionMessage.id) ?? null
  }, [actionMessage, branchThreadItems, userMessages])
  const activeAnswerId = actionMessage ? activeBranchByParent[actionMessage.id] : undefined
  const answerBranchIndex = answerBranchGroup ? selectSiblingIndex(answerBranchGroup, activeAnswerId) : -1
  const hasAnswerSiblings = Boolean(answerBranchGroup && answerBranchGroup.items.length > 1 && actionMessage)
  useEffect(() => {
    if (!answerBranchGroup || !actionMessage || pendingRegenerateParentId !== actionMessage.id) return
    const newestAnswer = answerBranchGroup.items[answerBranchGroup.items.length - 1]
    if (!newestAnswer) return
    setActiveBranch(actionMessage.id, newestAnswer.id)
    setPendingRegenerateParentId(null)
  }, [actionMessage, answerBranchGroup, pendingRegenerateParentId, setActiveBranch])
  const cycleActionBranch = (direction: -1 | 1) => {
    if (!actionBranchGroup || !actionMessage) return
    const nextId = cycleSibling(actionBranchGroup, actionMessage.id, direction)
    if (!nextId) return
    setActiveBranch(actionBranchGroup.parentItemId ?? 'root', nextId)
    setActionMessageId(nextId)
    void chatkit.sendCustomAction({
      type: 'message.select_branch',
      payload: {
        action: 'message.select_branch',
        thread_id: selectedThreadId,
        item_id: nextId,
        parent_item_id: actionBranchGroup.parentItemId ?? 'root',
      },
    }).then(() => fetchUpdates())
  }
  const cycleAnswerBranch = (direction: -1 | 1) => {
    if (!answerBranchGroup || !actionMessage) return
    const nextId = cycleSibling(answerBranchGroup, activeAnswerId, direction)
    if (!nextId) return
    setActiveBranch(actionMessage.id, nextId)
    void chatkit.sendCustomAction({
      type: 'message.select_branch',
      payload: {
        action: 'message.select_branch',
        thread_id: selectedThreadId,
        item_id: nextId,
        parent_item_id: actionMessage.id,
      },
    }).then(() => fetchUpdates())
  }
  useEffect(() => {
    if (
      persistedActionMessage
      && actionMessageId !== persistedActionMessage.id
      && Object.keys(localActiveBranchByParent).length === 0
    ) {
      setActionMessageId(persistedActionMessage.id)
      return
    }
    if (!actionMessageId && (persistedActionMessage || lastUserMessage)) {
      setActionMessageId((persistedActionMessage ?? lastUserMessage)?.id ?? null)
    }
    if (actionMessageId && !userMessages.some((message) => message.id === actionMessageId)) setActionMessageId(lastUserMessage?.id ?? null)
  }, [actionMessageId, lastUserMessage, localActiveBranchByParent, persistedActionMessage, userMessages])

  const synchronizeAfterReconnect = useCallback(async (force = false) => {
    setReconnectStatus('syncing')
    try {
      const replay = await localFetch.flushOutbox({ force })
      await Promise.all([
        fetchUpdates(),
        refetchMessages(),
        localFetch.refreshThreadItems(selectedThreadId),
      ])
      setQueuedGenerationCount(replay.pending)
      setReconnectStatus(replay.pending > 0 ? 'error' : 'idle')
    } catch (error) {
      console.error('[ChatKit] Failed to refresh after reconnect:', error)
      setQueuedGenerationCount(localFetch.getOutboxSize())
      setReconnectStatus('error')
    }
  }, [fetchUpdates, localFetch, refetchMessages, selectedThreadId])

  const probeConnection = useCallback(async (): Promise<boolean> => {
    if (!podBaseUrl || !sessionFetch) return false
    const controller = new AbortController()
    const timeoutId = window.setTimeout(() => controller.abort('connectivity_probe_timeout'), 5_000)
    try {
      const reachable = await probeChatConnectivity({
        fetcher: sessionFetch,
        podBaseUrl,
        signal: controller.signal,
      })
      isOnlineRef.current = reachable
      setIsOnline(reachable)
      return reachable
    } catch {
      isOnlineRef.current = false
      setIsOnline(false)
      return false
    } finally {
      window.clearTimeout(timeoutId)
    }
  }, [podBaseUrl, sessionFetch])

  useEffect(() => {
    let disposed = false
    const refreshReachability = async (synchronize: boolean) => {
      const reachable = await probeConnection()
      if (disposed || !reachable) {
        if (!reachable) setReconnectStatus('idle')
        return
      }
      if (synchronize) await synchronizeAfterReconnect(true)
    }
    const handleOffline = () => {
      // Browsers can report offline while a localhost Xpod is healthy. Verify
      // the selected Pod before showing an offline state.
      void refreshReachability(false)
    }
    const handleOnline = () => {
      void refreshReachability(true)
    }

    window.addEventListener('offline', handleOffline)
    window.addEventListener('online', handleOnline)
    void refreshReachability(false)
    const retryTimer = window.setInterval(() => {
      if (!isOnlineRef.current) void refreshReachability(true)
    }, 15_000)
    return () => {
      disposed = true
      window.clearInterval(retryTimer)
      window.removeEventListener('offline', handleOffline)
      window.removeEventListener('online', handleOnline)
    }
  }, [probeConnection, synchronizeAfterReconnect])

  useEffect(() => {
    if (!isOnline || queuedGenerationCount === 0) return
    const retryAt = localFetch.getOutboxRetryAt()
    if (retryAt === null) return
    const timer = window.setTimeout(() => {
      void synchronizeAfterReconnect(false)
    }, Math.max(0, retryAt - Date.now()))
    return () => window.clearTimeout(timer)
  }, [isOnline, localFetch, outboxRevision, queuedGenerationCount, synchronizeAfterReconnect])

  useEffect(() => {
    if (!isChatKitMounted || !selectedThreadId) return

    let disposed = false

    const restoreThread = async () => {
      try {
        // The wrapper registers its own `whenDefined` callback before this
        // effect. Waiting here guarantees that setOptions has reached the
        // upgraded element even when the ready event fired before handlers
        // were attached.
        await customElements.whenDefined('openai-chatkit')
        if (disposed) return

        // ChatKit initializes its internal id from `initialThread`. Calling
        // `setThreadId` with that same id can therefore be treated as a no-op,
        // leaving history empty after a hard refresh. Force a transition on
        // mount and when changing chat scope; normal same-chat thread
        // navigation stays direct so ChatKit can retain composer drafts.
        if (
          restoredChatIdRef.current !== selectedChatId
          || (
            !restoredInitialThreadRef.current
            && selectedThreadId === initialThreadIdRef.current
          )
        ) {
          await setThreadId(null)
          if (disposed) return
        }

        await setThreadId(selectedThreadId)
        if (disposed) return

        // `initialThread` and `setThreadId` select the conversation, but
        // ChatKit may elide a history request when both ids are identical.
        // Explicitly synchronize after selection so a page reload always
        // restores messages and persisted item state such as feedback.
        await fetchUpdates()
        await localFetch.refreshThreadItems(selectedThreadId)
        restoredInitialThreadRef.current = true
        restoredChatIdRef.current = selectedChatId
      } catch (error) {
        if (!disposed) {
          console.error('[ChatKit] Failed to restore thread:', error)
        }
      }
    }

    void restoreThread()

    return () => {
      disposed = true
    }
  }, [fetchUpdates, isChatKitMounted, localFetch, selectedChatId, selectedThreadId, setThreadId])

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
        ref={bindChatKitHost as any}
        control={chatkit.control}
        style={{ display: 'block', width: '100%', height: '100%' }}
      />
      {isGenerating ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="absolute bottom-20 left-1/2 z-30 h-9 -translate-x-1/2 gap-2 rounded-full bg-background/95 px-4 shadow-md backdrop-blur"
          aria-label="停止生成"
          onClick={() => abortGenerationRef.current?.()}
        >
          <Square className="size-3 fill-current" />
          停止生成
        </Button>
      ) : null}
      {actionMessage && !isGenerating ? (
        <div className="absolute bottom-40 left-3 right-3 z-20 flex justify-end">
          <div className="flex max-w-full gap-1 overflow-x-auto rounded-md border bg-background/95 p-1 shadow-sm">
            <select aria-label="选择要操作的用户消息" className="h-10 min-w-0 max-w-[220px] flex-1 bg-transparent px-1 text-xs md:h-8" value={actionMessage.id} onChange={(event) => setActionMessageId(event.target.value)}>
              {userMessages.map((message, index) => <option key={message.id} value={message.id}>消息 {index + 1}：{(message.content ?? '').slice(0, 24)}</option>)}
            </select>
            {hasBranchSiblings ? (
              <>
                <Button variant="ghost" size="icon" className="size-10 shrink-0" aria-label="上一个分支" title="上一个分支" onClick={() => cycleActionBranch(-1)}><ArrowLeft className="size-3.5" /></Button>
                <span className="flex min-w-12 items-center justify-center text-xs tabular-nums">{actionBranchIndex + 1}/{actionBranchGroup?.items.length}</span>
                <Button variant="ghost" size="icon" className="size-10 shrink-0" aria-label="下一个分支" title="下一个分支" onClick={() => cycleActionBranch(1)}><ArrowRight className="size-3.5" /></Button>
              </>
            ) : null}
            {hasAnswerSiblings ? (
              <>
                <Button variant="ghost" size="icon" className="size-10 shrink-0" aria-label="上一个回答" title="上一个回答" onClick={() => cycleAnswerBranch(-1)}><ArrowLeft className="size-3.5" /></Button>
                <span className="flex min-w-16 items-center justify-center text-xs tabular-nums">回答 {answerBranchIndex + 1}/{answerBranchGroup?.items.length}</span>
                <Button variant="ghost" size="icon" className="size-10 shrink-0" aria-label="下一个回答" title="下一个回答" onClick={() => cycleAnswerBranch(1)}><ArrowRight className="size-3.5" /></Button>
              </>
            ) : null}
            <Button variant="ghost" size="icon" className="size-10 shrink-0" aria-label="编辑消息" title="编辑消息" onClick={() => setEditingMessage({ id: actionMessage.id, text: actionMessage.content ?? '' })}>
              <Pencil className="size-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="size-10 shrink-0" aria-label="重新生成回答" title="重新生成回答" onClick={async () => {
              setPendingRegenerateParentId(actionMessage.id)
              try {
                await chatkit.sendCustomAction({ type: 'message.regenerate', payload: { action: 'message.regenerate', thread_id: selectedThreadId, item_id: actionMessage.id } })
              } catch {
                setPendingRegenerateParentId(null)
                // ChatKit surfaces the protocol error through its configured onError callback.
              } finally {
                await Promise.allSettled([fetchUpdates(), localFetch.refreshThreadItems(selectedThreadId)])
              }
            }}>
              <RefreshCw className="size-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="size-10 shrink-0" aria-label="引用消息" title="引用消息" onClick={() => void setComposerValue({ text: `> ${actionMessage.content ?? ''}\n\n` })}>
              <Quote className="size-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="size-10 shrink-0 text-destructive hover:text-destructive" aria-label="删除消息" title="删除消息" onClick={async () => {
              if (!window.confirm('确定删除上一条消息吗？')) return
              try {
                await chatkit.sendCustomAction({ type: 'message.delete', payload: { action: 'message.delete', thread_id: selectedThreadId, item_id: actionMessage.id } })
              } catch {
                // ChatKit surfaces the protocol error through its configured onError callback.
              } finally {
                await Promise.allSettled([fetchUpdates(), refetchMessages()])
              }
            }}>
              <Trash2 className="size-3.5" />
            </Button>
          </div>
        </div>
      ) : null}
      <Dialog open={editingMessage !== null} onOpenChange={(open) => { if (!open) setEditingMessage(null) }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>编辑消息</DialogTitle>
            <DialogDescription>原消息与回答会保留为一个分支，并从编辑后的内容重新生成。</DialogDescription>
          </DialogHeader>
          <Textarea value={editingMessage?.text ?? ''} onChange={(event) => setEditingMessage((current) => current ? { ...current, text: event.target.value } : current)} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingMessage(null)}>取消</Button>
            <Button disabled={!editingMessage?.text.trim()} onClick={async () => {
              if (!editingMessage) return
              try {
                await chatkit.sendCustomAction({ type: 'message.edit', payload: { action: 'message.edit', thread_id: selectedThreadId, item_id: editingMessage.id, text: editingMessage.text, regenerate: true } })
              } catch {
                // The edited branch may already be persisted even if regeneration fails.
              } finally {
                setEditingMessage(null)
                // Let the refreshed item list select the newly-created user
                // branch instead of keeping the superseded message selected.
                setActionMessageId(null)
                await Promise.allSettled([fetchUpdates(), refetchMessages(), localFetch.refreshThreadItems(selectedThreadId)])
              }
            }}>保存并重新生成</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {!isOnline ? (
        <div role="alert" className="absolute inset-x-3 top-3 z-20 flex items-center gap-2 rounded-lg border border-warning/25 bg-background/95 px-3 py-2 text-sm shadow-sm backdrop-blur">
          <WifiOff className="size-4 text-warning" />
          <span>
            网络已断开。仍可发送，消息会保存在本地空间并在连接恢复后自动生成。
            {queuedGenerationCount > 0 ? ` 当前有 ${queuedGenerationCount} 条等待生成。` : ''}
          </span>
        </div>
      ) : reconnectStatus !== 'idle' ? (
        <div
          role={reconnectStatus === 'error' ? 'alert' : 'status'}
          className="absolute inset-x-3 top-3 z-20 flex items-center justify-between gap-3 rounded-lg border bg-background/95 px-3 py-2 text-sm shadow-sm backdrop-blur"
        >
          <span>
            {reconnectStatus === 'syncing'
              ? queuedGenerationCount > 0
                ? `连接已恢复，正在重试 ${queuedGenerationCount} 条待生成消息…`
                : '连接已恢复，正在同步最新消息…'
              : queuedGenerationCount > 0
                ? `仍有 ${queuedGenerationCount} 条消息等待生成。`
                : '连接已恢复，但消息同步失败。'}
          </span>
          {reconnectStatus === 'error' ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7"
              onClick={() => {
                void synchronizeAfterReconnect(true)
              }}
            >
              重试同步
            </Button>
          ) : null}
        </div>
      ) : null}
      <div className="pointer-events-none absolute inset-x-3 top-3 z-10 flex min-w-0 items-center justify-between gap-2">
        <div className="pointer-events-auto flex shrink-0 gap-2">
          {podBaseUrl && selectedWorkspaceUri ? (
            <Button type="button" variant="outline" size="sm" className="h-9 gap-1.5 rounded-full bg-background/95 px-3 shadow-sm backdrop-blur" onClick={() => setProjectContextOpen(true)} aria-label="查看项目上下文与记忆">
              <Brain className="size-3.5" /><span className="hidden xl:inline">项目上下文</span>
            </Button>
          ) : null}
          {threadAttachments.length > 0 ? (
            <Button type="button" variant="outline" size="sm" className="h-9 gap-1.5 rounded-full bg-background/95 px-3 shadow-sm backdrop-blur" onClick={() => setAttachmentsOpen(true)} aria-label={`查看会话附件，共 ${threadAttachments.length} 个`}>
              <Paperclip className="size-3.5" /><span>附件 {threadAttachments.length}</span>
            </Button>
          ) : null}
        </div>
        <div className="pointer-events-auto flex min-w-0 items-center gap-1 overflow-x-auto rounded-full bg-background/80 p-0.5 backdrop-blur">
          <Button type="button" variant="outline" size="sm" className="h-9 shrink-0 gap-1.5 rounded-full bg-background/95 px-3" onClick={() => setCaptureOpen(true)} aria-label="添加屏幕或摄像头画面">
            <Camera className="size-3.5" /><span className="hidden xl:inline">画面</span>
          </Button>
          <Button type="button" variant="outline" size="sm" className="h-9 shrink-0 gap-1.5 rounded-full bg-background/95 px-3" onClick={() => setVoiceOpen(true)} aria-label="打开实时语音对话">
            <Mic className="size-3.5" /><span className="hidden xl:inline">语音对话</span>
          </Button>
          {latestAssistantText ? (
            <Button type="button" variant={isReading ? 'secondary' : 'outline'} size="sm" className="h-9 shrink-0 gap-1.5 rounded-full bg-background/95 px-3" onClick={toggleReadAloud} aria-label={isReading ? '停止朗读回答' : '朗读最新回答'}>
              {isReading ? <Square className="size-3.5 fill-current" /> : <Volume2 className="size-3.5" />}<span className="hidden xl:inline">{isReading ? '停止朗读' : '朗读'}</span>
            </Button>
          ) : null}
          {artifactVersions.length > 0 ? (
            <Button type="button" variant="outline" size="sm" className="h-9 shrink-0 gap-1.5 rounded-full bg-background/95 px-3" onClick={() => setArtifactsOpen(true)} aria-label={`打开产物工作区，共 ${artifactVersions.length} 个版本`}>
              <FileOutput className="size-3.5" /><span className="hidden xl:inline">产物 {artifactVersions.length}</span>
            </Button>
          ) : null}
          {podBaseUrl ? (
            <Button type="button" variant="outline" size="sm" className="h-9 shrink-0 gap-1.5 rounded-full bg-background/95 px-3" onClick={() => setAssetLibraryOpen(true)} aria-label={`打开会话资产中心，共 ${chatAssets.length} 个资产`}>
              <FolderOpen className="size-3.5" /><span className="hidden xl:inline">资产 {chatAssets.length}</span>
            </Button>
          ) : null}
          {podBaseUrl && sessionWebId ? (
            <Button type="button" variant="outline" size="sm" className="h-9 shrink-0 gap-1.5 rounded-full bg-background/95 px-3" onClick={() => setShareOpen(true)} aria-label="分享与导出当前会话">
              <Share2 className="size-3.5" /><span className="hidden xl:inline">分享与导出</span>
            </Button>
          ) : null}
        </div>
      </div>
      {speechError ? <div role="alert" className="absolute right-3 top-14 z-20 rounded-lg border border-destructive/30 bg-background/95 px-3 py-2 text-xs text-destructive shadow-sm">{speechError}</div> : null}
      <Dialog open={attachmentsOpen} onOpenChange={setAttachmentsOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>会话附件</DialogTitle>
            <DialogDescription>附件保存在当前空间，可以预览、打开或下载。</DialogDescription>
          </DialogHeader>
          {attachmentLoadError ? <p role="alert" className="text-sm text-destructive">{attachmentLoadError}</p> : null}
          <div className="grid max-h-[60vh] grid-cols-1 gap-3 overflow-y-auto sm:grid-cols-2">
            {threadAttachments.map((attachment) => {
              return (
                <div key={attachment.id} className="overflow-hidden rounded-xl border bg-muted/20">
                  {attachment.type === 'image' && attachment.preview_url ? (
                    <button
                      type="button"
                      className="block aspect-video w-full overflow-hidden bg-muted text-left"
                      onClick={() => void previewStoredAttachment(attachment)}
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
                    {attachment.type === 'image' ? (
                      <Button type="button" variant="ghost" size="icon" disabled={loadingAttachmentId === attachment.id} onClick={() => void previewStoredAttachment(attachment)} aria-label={`打开 ${attachment.name}`}>
                        <ExternalLink className="size-4" />
                      </Button>
                    ) : null}
                    <Button type="button" variant="ghost" size="icon" disabled={loadingAttachmentId === attachment.id} onClick={() => void downloadStoredAttachment(attachment)} aria-label={`下载 ${attachment.name}`}>
                      <Download className="size-4" />
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={artifactsOpen} onOpenChange={setArtifactsOpen}>
        <DialogContent className="flex h-[min(88vh,860px)] max-w-[min(96vw,1200px)] flex-col gap-0 overflow-hidden p-0">
          <DialogHeader className="border-b px-5 py-4">
            <DialogTitle>产物工作区</DialogTitle>
            <DialogDescription>预览运行产物、切换历史版本，或把选中版本带回对话继续修改。</DialogDescription>
          </DialogHeader>
          <ArtifactWorkspace
            versions={artifactVersions}
            authFetch={authFetchWithRecovery}
            onSaveVersion={async (version, content) => {
              await localFetch.saveArtifactVersion({
                threadId: selectedThreadId,
                uri: version.uri,
                name: version.name,
                mimeType: version.mimeType,
                content,
              })
              await Promise.allSettled([
                fetchUpdates(),
                refetchMessages(),
                localFetch.refreshThreadItems(selectedThreadId),
              ])
            }}
            onContinue={async (version) => {
              await setComposerValue({
                text: `请继续修改产物「${version.name}」。当前版本位于 ${version.uri}，请保留原文件并生成一个新版本。`,
              })
              await chatkit.focusComposer()
              setArtifactsOpen(false)
            }}
          />
        </DialogContent>
      </Dialog>
      {db && podBaseUrl && sessionWebId && selectedThreadUri ? (
        <ConversationShareDialog
          open={shareOpen}
          onOpenChange={setShareOpen}
          title={selectedThreadTitle || 'LinX 会话'}
          threadUri={selectedThreadUri}
          db={db}
          ownerWebId={sessionWebId}
          podBaseUrl={podBaseUrl}
          authFetch={authFetchWithRecovery}
          messages={messageRows}
        />
      ) : null}
      {db && podBaseUrl && selectedWorkspaceUri ? (
        <ProjectContextDialog
          open={projectContextOpen}
          onOpenChange={setProjectContextOpen}
          workspaceUri={selectedWorkspaceUri}
          db={db}
        />
      ) : null}
      {podBaseUrl ? (
        <ChatAssetLibraryDialog
          open={assetLibraryOpen}
          onOpenChange={setAssetLibraryOpen}
          assets={chatAssets}
          authFetch={authFetchWithRecovery}
          onReuse={async (asset) => {
            const attachment = await localFetch.prepareAttachmentForReuse(asset)
            if (attachment.type === 'image' && !attachment.preview_url) {
              throw new Error('图片预览尚未就绪，请重试。')
            }
            const composerAttachment = attachment.type === 'image'
              ? {
                  type: 'image' as const,
                  id: attachment.id,
                  name: attachment.name,
                  mime_type: attachment.mime_type,
                  preview_url: attachment.preview_url!,
                }
              : {
                  type: 'file' as const,
                  id: attachment.id,
                  name: attachment.name,
                  mime_type: attachment.mime_type,
                }
            await setComposerValue({ attachments: [composerAttachment] })
            await chatkit.focusComposer()
          }}
        />
      ) : null}
      <MultimodalCaptureDialog
        open={captureOpen}
        onOpenChange={setCaptureOpen}
        onCapture={async (file) => {
          await setComposerValue({ files: [file] })
          await chatkit.focusComposer()
        }}
      />
      <VoiceConversationDialog
        open={voiceOpen}
        onOpenChange={setVoiceOpen}
        assistantText={latestAssistantText}
        isGenerating={isGenerating}
        onSend={(text) => chatkit.sendUserMessage({ text })}
      />
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
      {sendDisabled ? (
        <div className="absolute inset-x-0 bottom-0 z-10 flex min-h-24 items-center justify-center border-t border-warning/20 bg-background/95 px-4 text-sm text-muted-foreground">
          空间连接恢复后可继续发送
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
  const secretaryDraftScope: ChatDraftScope = useMemo(() => ({
    accountScope: secretaryScopeKey,
    chatId: LINX_DEFAULT_SECRETARY.chatId,
  }), [secretaryScopeKey])
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
  }, [secretaryDraftScope, secretaryScopeKey])

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
  }, [secretaryDraftScope, secretaryScopeKey])

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
    return threads.find((thread) => chatThreadRefsMatch(thread.id, selectedThreadId)) ?? null
  }, [selectedThreadId, threads])
  const persistedActiveBranchByParent = useMemo(
    () => readActiveBranchSelections(activeThread?.metadata),
    [activeThread?.metadata],
  )
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

    // A restored thread can still be usable even when an older Pod row is
    // missing the parent relation required by the navigation query. ChatKit
    // loads it by its persisted resource id, so do not replace an explicit
    // selection with an unrelated empty thread from the list.
    if (selectedThreadId) {
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
            selectedWorkspaceUri={activeThread?.workspace}
            persistedActiveBranchByParent={persistedActiveBranchByParent}
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
