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
import { usePodInterfaceAccess } from '@/lib/matrix/usePodInterfaceAccess'
import { useLiveQuery } from '@tanstack/react-db'
import { chatCollection } from '../../collections'
import { isSharedRoomChatRow, sharedRoomReferenceForSelection } from '../../data/shared-room-runtime'
import {
  createSharedRoomConversation,
  SharedRoomAuthorizationRequiredError,
} from './shared-room-conversation'
import { MatrixInterfaceAuthorizeUnavailableError } from '@/lib/matrix/pod-interface-access'

export type ReconnectStatus = 'idle' | 'syncing' | 'error'

interface UseLocalChatRuntimeOptions {
  session: Session
  selectedThreadId: string
  selectedChatId: string
  selectedThreadTitle?: string
  persistedActiveBranchByParent?: Record<string, string>
  sendDisabled: boolean
  onRequestError?: (message: string) => void
}

function createUnavailableFetch(): LocalChatKitFetch {
  const unavailableFetch = (async () => unavailableResponse()) as unknown as LocalChatKitFetch
  unavailableFetch.refreshThreadItems = async () => undefined
  unavailableFetch.interrupt = () => undefined
  unavailableFetch.ensureAiServiceAccess = async () => { throw new Error('当前空间连接尚未恢复') }
  unavailableFetch.loadAttachmentObjectUrl = async () => { throw new Error('当前空间连接尚未恢复') }
  unavailableFetch.prepareAttachmentForReuse = async () => { throw new Error('当前空间连接尚未恢复') }
  unavailableFetch.saveArtifactVersion = async () => { throw new Error('当前空间连接尚未恢复') }
  unavailableFetch.conversation = {
    load: async () => { throw new Error('当前空间连接尚未恢复') },
    resolveItemUri: (itemId) => itemId,
    uploadAttachment: async () => { throw new Error('当前空间连接尚未恢复') },
    run: async function* () { throw new Error('当前空间连接尚未恢复') },
  }
  unavailableFetch.dispose = () => undefined
  return unavailableFetch
}

export function useLocalChatRuntime({
  session,
  selectedThreadId,
  selectedChatId,
  selectedThreadTitle,
  persistedActiveBranchByParent,
  sendDisabled,
  onRequestError,
}: UseLocalChatRuntimeOptions) {
  const { db } = useSolidDatabase()
  const sessionFetch = session.fetch
  const sessionWebId = session.info.webId
  const [threadAttachments, setThreadAttachments] = useState<Attachment[]>([])
  const [threadItems, setThreadItems] = useState<ThreadItem[]>([])
  const [isGenerating, setIsGenerating] = useState(false)
  const [reconnectStatus, setReconnectStatus] = useState<ReconnectStatus>('idle')
  const [serviceAccessRequired, setServiceAccessRequired] = useState(false)
  const [serviceAccessError, setServiceAccessError] = useState<string | null>(null)
  const [isGrantingServiceAccess, setIsGrantingServiceAccess] = useState(false)
  const [matrixAuthorizationRequired, setMatrixAuthorizationRequired] = useState(false)
  const [matrixAuthorizationError, setMatrixAuthorizationError] = useState<string | null>(null)
  const [matrixNativeGrantRequired, setMatrixNativeGrantRequired] = useState(false)
  const [isAuthorizingMatrix, setIsAuthorizingMatrix] = useState(false)
  const matrixAccess = usePodInterfaceAccess()
  const chatQuery = useLiveQuery(chatCollection)
  const selectedChatRow = (chatQuery.data ?? []).find(
    (chat: { id: string }) => chat.id === selectedChatId,
  ) as { id: string; title?: string | null; metadata?: Record<string, unknown> | null } | undefined
  const isSharedRoom = Boolean(selectedChatRow && isSharedRoomChatRow(selectedChatRow))
  const sharedReference = useMemo(
    () => sharedRoomReferenceForSelection(selectedChatRow),
    [selectedChatRow],
  )
  // Session/credential objects can be recreated by their providers; hold them
  // in refs so the conversation (and its polling timer) is not rebuilt every
  // render. Only the canonical reference identity recreates it.
  const sharedSessionRef = useRef(session)
  sharedSessionRef.current = session
  const matrixAccessRef = useRef(matrixAccess)
  matrixAccessRef.current = matrixAccess
  const sharedConversation = useMemo(() => {
    const activeAccess = matrixAccessRef.current
    if (!sharedReference || !activeAccess) return null
    return createSharedRoomConversation({
      session: sharedSessionRef.current,
      reference: sharedReference,
      matrixAccess: activeAccess,
      onError: (error) => {
        if (error instanceof SharedRoomAuthorizationRequiredError) {
          setMatrixAuthorizationRequired(true)
          setMatrixAuthorizationError(null)
          return
        }
        // True read/permission reason for the banner; never a logout.
        setMatrixAuthorizationError(error.message)
        if (/\b403\b|forbidden|没有.*权限|unauthori[sz]ed/iu.test(error.message)) {
          setMatrixAuthorizationRequired(true)
        }
      },
    })
  }, [sharedReference])
  useEffect(() => {
    if (!sharedConversation) return
    // Initial read also decides whether the authorization banner is needed: a
    // missing/revoked credential must be actionable, not a silent empty room.
    void sharedConversation.load().then((loaded) => {
      setThreadItems(loaded.items.map((entry) => entry.item))
      setMatrixAuthorizationRequired(false)
      setMatrixAuthorizationError(null)
    }).catch((cause) => {
      if (cause instanceof SharedRoomAuthorizationRequiredError) {
        setMatrixAuthorizationRequired(true)
        setMatrixAuthorizationError(null)
        return
      }
      if (cause instanceof Error) {
        setMatrixAuthorizationError(cause.message)
        if (/\b403\b|forbidden|没有.*权限|unauthori[sz]ed/iu.test(cause.message)) {
          setMatrixAuthorizationRequired(true)
        }
      }
    })
    // One poll owner: the surface subscribes for imports; this hook only tracks
    // the timeline for the welcome/empty heuristics.
    const unsubscribe = sharedConversation.subscribe(() => {
      void sharedConversation.load().then((loaded) => {
        setThreadItems(loaded.items.map((entry) => entry.item))
      }).catch(() => undefined)
    })
    return () => {
      unsubscribe()
      sharedConversation.dispose()
    }
  }, [sharedConversation])
  const abortGenerationRef = useRef<(() => void) | null>(null)
  const sendAvailableRef = useRef(!sendDisabled)
  const selectedThreadTitleRef = useRef(selectedThreadTitle)
  const persistedActiveBranchByParentRef = useRef(persistedActiveBranchByParent)
  const sessionFetchRef = useRef(sessionFetch)
  const onRequestErrorRef = useRef(onRequestError)
  sendAvailableRef.current = !sendDisabled
  selectedThreadTitleRef.current = selectedThreadTitle
  persistedActiveBranchByParentRef.current = persistedActiveBranchByParent
  onRequestErrorRef.current = onRequestError
  sessionFetchRef.current = sessionFetch

  const authFetch = useCallback(async (input: RequestInfo | URL, init?: RequestInit) => {
    const currentSessionFetch = sessionFetchRef.current
    if (!currentSessionFetch) throw new Error('当前空间连接尚未恢复')
    const response = await currentSessionFetch(input, init)
    if (response.status === 401) requestSessionRecovery()
    return response
  }, [])

  const localFetch = useMemo(() => {
    // A shared room never gets a local ChatKit/AI backend: all reads and sends
    // go through the owner-room conversation adapter below.
    if (!db || !sessionWebId || !sessionFetch || isSharedRoom) return createUnavailableFetch()
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
      isAvailable: () => sendAvailableRef.current && !isSharedRoom,
      // The 附件 dialog lists the whole chat itself (ConversationDialogs); the
      // store only ever reports the last thread it happened to load.
      onRequestError: (message) => onRequestErrorRef.current?.(message),
      onStreamingChange: ({ active, abort }) => {
        abortGenerationRef.current = abort ?? null
        setIsGenerating(active)
      },
      onThreadItemsChange: setThreadItems,
      ...(matrixAccess ? { matrixAccess } : {}),
      onMatrixAuthorizationRequired: () => {
        setMatrixAuthorizationRequired(true)
        setMatrixAuthorizationError(null)
      },
      onServiceAccessRequired: () => {
        setServiceAccessRequired(true)
        setReconnectStatus('idle')
      },
      onServiceAccessRecovered: () => {
        setServiceAccessRequired(false)
        setServiceAccessError(null)
      },
      onChatSummaryChange: ({ messageId, content, createdAt }) => projectChatSummary(selectedChatId, {
        lastMessageId: messageId,
        lastMessagePreview: content.slice(0, 100),
        lastActiveAt: createdAt,
        updatedAt: createdAt,
      }),
    })
  }, [authFetch, db, isSharedRoom, matrixAccess, selectedChatId, selectedThreadId, sessionWebId])

  useEffect(() => {
    setThreadAttachments([])
    return () => localFetch.dispose?.()
  }, [localFetch])
  const interrupt = useCallback(() => {
    // Abort every active ChatKit stream. Custom actions such as regenerate or
    // edit can briefly overlap a refresh stream, so retaining only the latest
    // callback can leave the actual model request running.
    localFetch.interrupt()
    abortGenerationRef.current?.()
  }, [localFetch])
  const authorizeMatrixAccess = useCallback(async () => {
    if (!matrixAccess) {
      setMatrixAuthorizationError('当前空间或账号尚未就绪，请稍后重试。')
      return
    }
    setIsAuthorizingMatrix(true)
    setMatrixAuthorizationError(null)
    setMatrixNativeGrantRequired(false)
    try {
      await matrixAccess.authorize()
      setMatrixAuthorizationRequired(false)
    } catch (error) {
      if (error instanceof MatrixInterfaceAuthorizeUnavailableError) {
        // No dead-end "login expired" copy: guide the native account page.
        setMatrixNativeGrantRequired(true)
      } else {
        setMatrixAuthorizationError(error instanceof Error ? error.message : '群聊授权没有完成，请重试。')
      }
      throw error
    } finally {
      setIsAuthorizingMatrix(false)
    }
  }, [matrixAccess])

  const importMatrixAccess = useCallback(async (input: {
    apiKey?: string
    clientId?: string
    clientSecret?: string
  }) => {
    if (!matrixAccess) {
      setMatrixAuthorizationError('当前空间或账号尚未就绪，请稍后重试。')
      return
    }
    setIsAuthorizingMatrix(true)
    setMatrixAuthorizationError(null)
    try {
      await matrixAccess.importAuthorization(input)
      setMatrixNativeGrantRequired(false)
      setMatrixAuthorizationRequired(false)
    } catch (error) {
      setMatrixAuthorizationError(error instanceof Error ? error.message : '访问凭据没有生效，请检查后重试。')
      throw error
    } finally {
      setIsAuthorizingMatrix(false)
    }
  }, [matrixAccess])

  const dismissMatrixNativeGrant = useCallback(() => {
    // Cancelling creates nothing and sends nothing; the consent prompt can be
    // reopened later from the same banner.
    setMatrixNativeGrantRequired(false)
    setMatrixAuthorizationError(null)
  }, [])

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
    /** Shared-room backend for the same AG-UI surface; null for normal chats. */
    conversation: sharedConversation ?? localFetch.conversation,
    isSharedRoom,
    authFetch,
    threadAttachments,
    setThreadAttachments,
    threadItems,
    isGenerating,
    reconnectStatus,
    setReconnectStatus,
    serviceAccessRequired,
    serviceAccessError,
    isGrantingServiceAccess,
    grantServiceAccess,
    matrixAuthorizationRequired,
    matrixAuthorizationError,
    matrixNativeGrantRequired,
    matrixAccountOrigin: matrixAccess?.accountOrigin() ?? null,
    importMatrixAccess,
    dismissMatrixNativeGrant,
    isAuthorizingMatrix,
    authorizeMatrixAccess,
    interrupt,
  }
}
