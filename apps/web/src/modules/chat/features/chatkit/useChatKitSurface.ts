import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useChatKit, type OpenAIChatKit } from '@openai/chatkit-react'
import { restoreChatMessageAnchor } from '../../message-anchor'
import { useChatStore } from '../../store'
import type { PendingComposerDraft } from '../../domain/conversation-workbench'
import type { LocalChatKitFetch } from '../../services/chatkit-local/fetch-handler'
import { createChatKitWorkbenchAdapter } from './chatkit-workbench-adapter'

interface UseChatKitSurfaceOptions {
  localFetch: LocalChatKitFetch
  selectedThreadId: string
  selectedChatId: string
  pendingComposerDraft: PendingComposerDraft | null
  onComposerDraftApplied: (draft: PendingComposerDraft) => void
  onComposerDraftError: (draft: PendingComposerDraft, error: unknown) => void
  interrupt: () => void
}

function readThemeMode(): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'light'
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light'
}

export function useChatKitSurface({
  localFetch,
  selectedThreadId,
  selectedChatId,
  pendingComposerDraft,
  onComposerDraftApplied,
  onComposerDraftError,
  interrupt,
}: UseChatKitSurfaceOptions) {
  const messageAnchorId = useChatStore((state) => state.messageAnchorId)
  const clearMessageAnchor = useChatStore((state) => state.clearMessageAnchor)
  const [loadFailed, setLoadFailed] = useState(false)
  const [isMounted, setIsMounted] = useState(false)
  const initialThreadIdRef = useRef(selectedThreadId)
  const restoredInitialThreadRef = useRef(false)
  const restoredChatIdRef = useRef<string | null>(null)
  const hostRef = useRef<OpenAIChatKit | null>(null)

  const handleChatKitLog = useCallback(({ name, data }: {
    name: string
    data?: Record<string, unknown>
  }) => {
    // ChatKit emits diagnostic events for analytics/debugging. Keep them out
    // of the normal console because payloads may contain large message/tool
    // objects; opt in explicitly when investigating ChatKit itself.
    if (import.meta.env.DEV && import.meta.env.VITE_DEBUG_CHATKIT === 'true') {
      console.debug('[chatkit]', name, data ?? {})
    }
  }, [])

  const handleChatKitError = useCallback(({ error }: { error: Error }) => {
    console.error('[ChatKit] Error:', error)
  }, [])

  const bindHost = useCallback((host: OpenAIChatKit | null) => {
    hostRef.current = host
    setIsMounted(Boolean(host))
  }, [])

  useEffect(() => {
    if (customElements.get('openai-chatkit')) {
      setLoadFailed(false)
      return
    }
    let disposed = false
    const timeoutId = window.setTimeout(() => {
      if (!disposed && !customElements.get('openai-chatkit')) setLoadFailed(true)
    }, 8_000)
    void customElements.whenDefined('openai-chatkit').then(() => {
      window.clearTimeout(timeoutId)
      if (!disposed) setLoadFailed(false)
    })
    return () => {
      disposed = true
      window.clearTimeout(timeoutId)
    }
  }, [])

  const chatkit = useChatKit({
    api: {
      url: 'local://chatkit',
      domainKey: 'local',
      fetch: localFetch,
      uploadStrategy: { type: 'two_phase' },
    },
    initialThread: initialThreadIdRef.current,
    theme: {
      colorScheme: readThemeMode(),
      color: { accent: { primary: '#735FC4', level: 2 } },
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
    onReady: () => setIsMounted(Boolean(hostRef.current)),
    onError: handleChatKitError,
    onLog: handleChatKitLog,
  })

  const workbench = useMemo(() => createChatKitWorkbenchAdapter({
    client: {
      setThreadId: chatkit.setThreadId,
      setComposerValue: chatkit.setComposerValue,
      focusComposer: chatkit.focusComposer,
      fetchUpdates: chatkit.fetchUpdates,
      sendUserMessage: chatkit.sendUserMessage,
      sendCustomAction: chatkit.sendCustomAction,
    },
    context: () => ({ threadId: selectedThreadId }),
    interrupt,
  }), [
    chatkit.fetchUpdates,
    chatkit.focusComposer,
    chatkit.sendCustomAction,
    chatkit.sendUserMessage,
    chatkit.setComposerValue,
    chatkit.setThreadId,
    interrupt,
    selectedThreadId,
  ])

  useEffect(() => {
    if (!isMounted || !selectedThreadId) return
    let disposed = false

    const restoreThread = async () => {
      try {
        await customElements.whenDefined('openai-chatkit')
        if (disposed) return
        if (
          restoredChatIdRef.current !== selectedChatId
          || (!restoredInitialThreadRef.current && selectedThreadId === initialThreadIdRef.current)
        ) {
          await workbench.surface.setThread(null)
          if (disposed) return
        }
        await workbench.surface.setThread(selectedThreadId)
        if (disposed) return
        await workbench.surface.refresh()
        await localFetch.refreshThreadItems(selectedThreadId)
        restoredInitialThreadRef.current = true
        restoredChatIdRef.current = selectedChatId
      } catch (error) {
        if (!disposed) console.error('[ChatKit] Failed to restore thread:', error)
      }
    }

    void restoreThread()
    return () => {
      disposed = true
    }
  }, [isMounted, localFetch, selectedChatId, selectedThreadId, workbench.surface])

  useEffect(() => {
    if (!pendingComposerDraft) return
    let disposed = false
    const applyDraft = async () => {
      try {
        await workbench.surface.setDraft({ text: pendingComposerDraft.text })
        if (!disposed) onComposerDraftApplied(pendingComposerDraft)
      } catch (error) {
        if (!disposed) onComposerDraftError(pendingComposerDraft, error)
      }
    }
    void applyDraft()
    return () => {
      disposed = true
    }
  }, [onComposerDraftApplied, onComposerDraftError, pendingComposerDraft, selectedThreadId, workbench.surface])

  useEffect(() => {
    if (!messageAnchorId || !hostRef.current) return
    let disposed = false
    let observer: MutationObserver | null = null
    let clearAnchorTimer: number | null = null

    const tryRestore = () => {
      if (disposed || !hostRef.current || !messageAnchorId) return false
      if (!restoreChatMessageAnchor(hostRef.current, messageAnchorId)) return false
      clearAnchorTimer = window.setTimeout(() => {
        if (!disposed) clearMessageAnchor()
      }, 2000)
      return true
    }

    if (!tryRestore()) {
      const observeRoot = hostRef.current.shadowRoot ?? hostRef.current
      observer = new MutationObserver(() => {
        if (tryRestore()) {
          observer?.disconnect()
          observer = null
        }
      })
      observer.observe(observeRoot, { childList: true, subtree: true, attributes: true })
    }
    const timeoutId = window.setTimeout(() => {
      observer?.disconnect()
      observer = null
    }, 4000)

    return () => {
      disposed = true
      observer?.disconnect()
      window.clearTimeout(timeoutId)
      if (clearAnchorTimer !== null) window.clearTimeout(clearAnchorTimer)
    }
  }, [clearMessageAnchor, messageAnchorId, selectedThreadId])

  return {
    control: chatkit.control,
    bindHost,
    loadFailed,
    surface: workbench.surface,
    commands: workbench.commands,
  }
}
