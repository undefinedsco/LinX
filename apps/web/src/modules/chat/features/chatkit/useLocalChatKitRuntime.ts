import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Session } from '@inrupt/solid-client-authn-browser'
import type { Attachment, ThreadItem } from '@/lib/vendor/xpod-chatkit'
import { requestSessionRecovery } from '@/modules/login/login-utils'
import { useSolidDatabase } from '@/providers/solid-database-provider'
import { projectChatSummary } from '../../collections'
import {
  createLocalChatKitFetch,
  unavailableResponse,
  type LocalChatKitFetch,
} from '../../services/chatkit-local/fetch-handler'

export type ReconnectStatus = 'idle' | 'syncing' | 'error'

interface UseLocalChatKitRuntimeOptions {
  session: Session
  selectedThreadId: string
  selectedChatId: string
  selectedThreadTitle?: string
  persistedActiveBranchByParent?: Record<string, string>
  sendDisabled: boolean
}

function createUnavailableFetch(): LocalChatKitFetch {
  const unavailableFetch = (async () => unavailableResponse()) as unknown as LocalChatKitFetch
  unavailableFetch.refreshThreadItems = async () => undefined
  unavailableFetch.getOutboxSize = () => 0
  unavailableFetch.getOutboxRetryAt = () => null
  unavailableFetch.flushOutbox = async () => ({ completed: 0, pending: 0 })
  unavailableFetch.ensureAiServiceAccess = async () => { throw new Error('当前空间连接尚未恢复') }
  unavailableFetch.loadAttachmentObjectUrl = async () => { throw new Error('当前空间连接尚未恢复') }
  unavailableFetch.prepareAttachmentForReuse = async () => { throw new Error('当前空间连接尚未恢复') }
  unavailableFetch.saveArtifactVersion = async () => { throw new Error('当前空间连接尚未恢复') }
  unavailableFetch.dispose = () => undefined
  return unavailableFetch
}

export function useLocalChatKitRuntime({
  session,
  selectedThreadId,
  selectedChatId,
  selectedThreadTitle,
  persistedActiveBranchByParent,
  sendDisabled,
}: UseLocalChatKitRuntimeOptions) {
  const { db } = useSolidDatabase()
  const sessionFetch = session.fetch
  const sessionWebId = session.info.webId
  const [threadAttachments, setThreadAttachments] = useState<Attachment[]>([])
  const [threadItems, setThreadItems] = useState<ThreadItem[]>([])
  const [isGenerating, setIsGenerating] = useState(false)
  const [queuedGenerationCount, setQueuedGenerationCount] = useState(0)
  const [outboxRevision, setOutboxRevision] = useState(0)
  const [reconnectStatus, setReconnectStatus] = useState<ReconnectStatus>('idle')
  const [serviceAccessRequired, setServiceAccessRequired] = useState(false)
  const [serviceAccessError, setServiceAccessError] = useState<string | null>(null)
  const [isGrantingServiceAccess, setIsGrantingServiceAccess] = useState(false)
  const abortGenerationRef = useRef<(() => void) | null>(null)
  const sendAvailableRef = useRef(!sendDisabled)
  const selectedThreadTitleRef = useRef(selectedThreadTitle)
  const persistedActiveBranchByParentRef = useRef(persistedActiveBranchByParent)
  sendAvailableRef.current = !sendDisabled
  selectedThreadTitleRef.current = selectedThreadTitle
  persistedActiveBranchByParentRef.current = persistedActiveBranchByParent

  const authFetch = useCallback(async (input: RequestInfo | URL, init?: RequestInit) => {
    if (!sessionFetch) throw new Error('当前空间连接尚未恢复')
    const response = await sessionFetch(input, init)
    if (response.status === 401) requestSessionRecovery()
    return response
  }, [sessionFetch])

  const localFetch = useMemo(() => {
    if (!db || !sessionWebId || !sessionFetch) return createUnavailableFetch()
    return createLocalChatKitFetch({
      db,
      webId: sessionWebId,
      authFetch,
      initialThread: {
        id: selectedThreadId,
        title: selectedThreadTitleRef.current,
        status: { type: 'active' },
        created_at: Math.floor(Date.now() / 1000),
        updated_at: Math.floor(Date.now() / 1000),
        metadata: {
          chat_id: selectedChatId,
          ...(persistedActiveBranchByParentRef.current
            ? { active_branch_by_parent: persistedActiveBranchByParentRef.current }
            : {}),
        },
      },
      isAvailable: () => sendAvailableRef.current,
      onAttachmentsChange: setThreadAttachments,
      onStreamingChange: ({ active, abort }) => {
        abortGenerationRef.current = abort ?? null
        setIsGenerating(active)
      },
      onThreadItemsChange: setThreadItems,
      onOutboxChange: (count) => {
        setQueuedGenerationCount(count)
        if (count > 0) setReconnectStatus((status) => status === 'idle' ? 'error' : status)
        setOutboxRevision((revision) => revision + 1)
      },
      onServiceAccessRequired: () => setServiceAccessRequired(true),
      onChatSummaryChange: ({ messageId, content, createdAt }) => projectChatSummary(selectedChatId, {
        lastMessageId: messageId,
        lastMessagePreview: content.slice(0, 100),
        lastActiveAt: createdAt,
        updatedAt: createdAt,
      }),
    })
  }, [authFetch, db, selectedChatId, selectedThreadId, sessionFetch, sessionWebId])

  useEffect(() => {
    setThreadAttachments([])
    const queuedCount = localFetch.getOutboxSize()
    setQueuedGenerationCount(queuedCount)
    if (queuedCount > 0) setReconnectStatus('error')
    setOutboxRevision((revision) => revision + 1)
    return () => localFetch.dispose?.()
  }, [localFetch])
  const interrupt = useCallback(() => abortGenerationRef.current?.(), [])
  const grantServiceAccess = useCallback(async () => {
    setIsGrantingServiceAccess(true)
    setServiceAccessError(null)
    try {
      await localFetch.ensureAiServiceAccess()
      setServiceAccessRequired(false)
    } catch (error) {
      setServiceAccessError(error instanceof Error ? error.message : 'AI 服务授权失败，请重试。')
      throw error
    } finally {
      setIsGrantingServiceAccess(false)
    }
  }, [localFetch])

  return {
    db,
    localFetch,
    authFetch,
    threadAttachments,
    setThreadAttachments,
    threadItems,
    isGenerating,
    queuedGenerationCount,
    setQueuedGenerationCount,
    outboxRevision,
    reconnectStatus,
    setReconnectStatus,
    serviceAccessRequired,
    serviceAccessError,
    isGrantingServiceAccess,
    grantServiceAccess,
    interrupt,
  }
}
