import { useCallback, useEffect, useRef, useState } from 'react'
import type { Session } from '@inrupt/solid-client-authn-browser'
import { probeChatConnectivity } from '../../domain/chat-connectivity'
import type { LocalChatKitFetch } from '../../services/chatkit-local/fetch-handler'
import type { ReconnectStatus } from './useLocalChatKitRuntime'

interface UseChatConnectivityOptions {
  podBaseUrl: string | null
  sessionFetch?: Session['fetch']
  localFetch: LocalChatKitFetch
  selectedThreadId: string
  queuedGenerationCount: number
  outboxRevision: number
  setQueuedGenerationCount: (count: number) => void
  setReconnectStatus: (status: ReconnectStatus) => void
  refreshSurface: () => Promise<void>
  refreshMessages?: () => Promise<unknown>
}

export function useChatConnectivity({
  podBaseUrl,
  sessionFetch,
  localFetch,
  selectedThreadId,
  queuedGenerationCount,
  outboxRevision,
  setQueuedGenerationCount,
  setReconnectStatus,
  refreshSurface,
  refreshMessages,
}: UseChatConnectivityOptions) {
  const [isOnline, setIsOnline] = useState(true)
  const isOnlineRef = useRef(true)

  const synchronize = useCallback(async (force = false) => {
    setReconnectStatus('syncing')
    try {
      const replay = await localFetch.flushOutbox({ force })
      await Promise.all([
        refreshSurface(),
        ...(refreshMessages ? [ refreshMessages() ] : []),
        localFetch.refreshThreadItems(selectedThreadId),
      ])
      setQueuedGenerationCount(replay.pending)
      setReconnectStatus(replay.pending > 0 ? 'error' : 'idle')
    } catch (error) {
      console.error('[ChatKit] Failed to refresh after reconnect:', error)
      setQueuedGenerationCount(localFetch.getOutboxSize())
      setReconnectStatus('error')
    }
  }, [localFetch, refreshMessages, refreshSurface, selectedThreadId, setQueuedGenerationCount, setReconnectStatus])

  const probe = useCallback(async () => {
    if (!podBaseUrl || !sessionFetch) return false
    const controller = new AbortController()
    const timeoutId = window.setTimeout(() => controller.abort('connectivity_probe_timeout'), 5_000)
    try {
      const reachable = await probeChatConnectivity({ fetcher: sessionFetch, podBaseUrl, signal: controller.signal })
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
    const refreshReachability = async (shouldSynchronize: boolean) => {
      const reachable = await probe()
      if (disposed || !reachable) {
        if (!reachable) setReconnectStatus('idle')
        return
      }
      if (shouldSynchronize) await synchronize(true)
    }
    const handleOffline = () => { void refreshReachability(false) }
    const handleOnline = () => { void refreshReachability(true) }
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
  }, [probe, setReconnectStatus, synchronize])

  useEffect(() => {
    if (!isOnline || queuedGenerationCount === 0) return
    const retryAt = localFetch.getOutboxRetryAt()
    if (retryAt === null) return
    const timer = window.setTimeout(() => { void synchronize(false) }, Math.max(0, retryAt - Date.now()))
    return () => window.clearTimeout(timer)
  }, [isOnline, localFetch, outboxRevision, queuedGenerationCount, synchronize])

  return { isOnline, synchronize }
}
