import { useCallback, useMemo, useRef, useState } from 'react'

export function useChatKitThreadReadiness({
  selectedChatId,
  selectedThreadId,
  isMounted,
  loadFailed,
}: {
  selectedChatId: string
  selectedThreadId: string
  isMounted: boolean
  loadFailed: boolean
}) {
  const surfaceKey = `${selectedChatId}\n${selectedThreadId}`
  const restoredSurfaceKeyRef = useRef<string | null>(null)
  const [readySurfaceKey, setReadySurfaceKey] = useState<string | null>(null)

  const reset = useCallback(() => {
    restoredSurfaceKeyRef.current = null
    setReadySurfaceKey(null)
  }, [])
  const markLoading = useCallback(() => setReadySurfaceKey(null), [])
  const markLoaded = useCallback(({ threadId }: { threadId: string }) => {
    if (threadId === selectedThreadId && restoredSurfaceKeyRef.current === surfaceKey) {
      setReadySurfaceKey(surfaceKey)
    }
  }, [selectedThreadId, surfaceKey])
  const markRestoring = useCallback(() => {
    restoredSurfaceKeyRef.current = null
    setReadySurfaceKey(null)
  }, [])
  const markRestored = useCallback(() => {
    restoredSurfaceKeyRef.current = surfaceKey
    setReadySurfaceKey(surfaceKey)
  }, [surfaceKey])

  return useMemo(() => ({
    isThreadReady: isMounted && !loadFailed && readySurfaceKey === surfaceKey,
    markLoaded,
    markLoading,
    markRestored,
    markRestoring,
    reset,
  }), [isMounted, loadFailed, markLoaded, markLoading, markRestored, markRestoring, readySurfaceKey, reset, surfaceKey])
}
