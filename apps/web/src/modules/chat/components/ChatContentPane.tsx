/**
 * ChatContentPane - AI 聊天内容面板
 *
 * 使用 OpenAI ChatKit SDK 作为主交互层。
 * Pod 负责留档；当本地 service 中存在运行时会话时，
 * ChatKit 的 assistant 响应会经由 runtime 转发并流式返回。
 */

import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { useSession } from '@/providers/solid-session-context'
import { Bot } from 'lucide-react'
import type { MicroAppPaneProps } from '@/modules/layout/micro-app-registry'
import { Button } from '@/components/ui/button'
import { useSolidDatabase } from '@/providers/solid-database-provider'
import { useChatInit } from '../collections'
import { ChatListPane } from './ChatListPane'
import { projectChatContentState, type ChatContentState, type ChatContentStateKind } from '../domain/chat-content-state'
import {
  SecretaryWelcome,
  type SecretaryStarterAction,
} from '../ui/SecretaryWelcome'
import { InboxActionBanner } from '../features/inbox/InboxActionBanner'
import { RuntimeSessionToolbar } from '../features/runtime/RuntimeSessionToolbar'
import { ChatKitPanel } from '../features/chatkit/ChatKitPanel'
import { useSecretaryChatController } from '../features/secretary/useSecretaryChatController'

export { chatThreadRefsMatch, readActiveBranchSelections } from '../domain/thread-selection'

export interface ChatContentPaneProps extends MicroAppPaneProps {}

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
  const secretary = useSecretaryChatController({
    databaseScopeKey,
    webId: session.info.webId,
    isReady,
  })
  const {
    selectedChatId,
    selectedThreadId,
    activeChat,
    activeThread,
    persistedActiveBranchByParent,
    isSecretary,
    isDefaultSecretarySettling,
    isChatsLoading,
    isThreadsLoading,
    chatError,
    threadError,
    refetchChats,
    refetchThreads,
    isCreatingThread,
    draft: secretaryDraft,
    activePendingDraft: activePendingSecretaryDraft,
    creationError: threadCreationError,
    handoffError: secretaryDraftHandoffError,
    updateDraft: updateSecretaryDraft,
    submitDraft: submitSecretaryDraft,
    retryThreadCreation,
    retryDraftHandoff: retrySecretaryDraftHandoff,
    completeDraftHandoff: completeSecretaryDraftHandoff,
    failDraftHandoff: failSecretaryDraftHandoff,
  } = secretary
  const retryContentQueries = useCallback(() => {
    if (databaseStatus !== 'ready' || !db) {
      retryDatabase()
      return
    }
    void Promise.all([refetchChats(), refetchThreads()])
  }, [databaseStatus, db, refetchChats, refetchThreads, retryDatabase])
  const isStagedSecretaryWelcome = isSecretary && !activeThread
  const isWaitingForChat = isChatsLoading && !activeChat
  const isWaitingForThread = isThreadsLoading && !selectedThreadId

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
        isSubmitting={isCreatingThread || Boolean(activePendingSecretaryDraft)}
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
