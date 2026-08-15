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
  const abortGenerationRef = useRef<(() => void) | null>(null)
  const sendAvailableRef = useRef(!sendDisabled)
  sendAvailableRef.current = !sendDisabled

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
        title: selectedThreadTitle,
        status: { type: 'active' },
        created_at: Math.floor(Date.now() / 1000),
        updated_at: Math.floor(Date.now() / 1000),
        metadata: {
          chat_id: selectedChatId,
          ...(persistedActiveBranchByParent ? { active_branch_by_parent: persistedActiveBranchByParent } : {}),
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
      onChatSummaryChange: ({ messageId, content, createdAt }) => projectChatSummary(selectedChatId, {
        lastMessageId: messageId,
        lastMessagePreview: content.slice(0, 100),
        lastActiveAt: createdAt,
        updatedAt: createdAt,
      }),
    })
  }, [authFetch, db, persistedActiveBranchByParent, selectedChatId, selectedThreadId, selectedThreadTitle, sessionFetch, sessionWebId])

  useEffect(() => {
    setThreadAttachments([])
    const queuedCount = localFetch.getOutboxSize()
    setQueuedGenerationCount(queuedCount)
    if (queuedCount > 0) setReconnectStatus('error')
    setOutboxRevision((revision) => revision + 1)
    return () => localFetch.dispose?.()
  }, [localFetch])
  const interrupt = useCallback(() => abortGenerationRef.current?.(), [])

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
    interrupt,
  }
}
