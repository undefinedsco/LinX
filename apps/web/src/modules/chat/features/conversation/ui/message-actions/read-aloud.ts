import { useCallback, useSyncExternalStore } from 'react'
import { speakText } from '../../../../domain/speech-output'

/**
 * 朗读: one answer at a time, browser speech synthesis. A second press on the
 * answer being read stops it; reading another answer replaces it.
 */
let readingId: string | null = null
let controller: AbortController | null = null
const listeners = new Set<() => void>()

function emit() {
  for (const listener of listeners) listener()
}

export function isReadAloudSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined'
}

export function stopReadAloud(): void {
  controller?.abort()
  controller = null
  if (isReadAloudSupported()) window.speechSynthesis.cancel()
  if (readingId !== null) {
    readingId = null
    emit()
  }
}

/** Starts reading `text` as `id`, or stops when `id` is already being read. */
export function toggleReadAloud(id: string, text: string, onError?: (message: string) => void): void {
  if (readingId === id) {
    stopReadAloud()
    return
  }
  if (!text.trim()) return
  stopReadAloud()
  const own = new AbortController()
  controller = own
  readingId = id
  emit()
  void speakText(text, own.signal)
    .catch((reason) => {
      if (reason instanceof DOMException && reason.name === 'AbortError') return
      onError?.(reason instanceof Error ? reason.message : '朗读失败，请重试。')
    })
    .finally(() => {
      if (controller === own) {
        controller = null
        readingId = null
        emit()
      }
    })
}

export function useReadAloud(id: string, text: string, onError?: (message: string) => void) {
  const reading = useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => readingId === id,
    () => false,
  )
  const toggle = useCallback(() => toggleReadAloud(id, text, onError), [id, onError, text])
  return { supported: isReadAloudSupported(), reading, toggle }
}
