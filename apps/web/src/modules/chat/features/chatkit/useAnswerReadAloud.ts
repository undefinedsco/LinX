import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ThreadItem } from '@/lib/vendor/xpod-chatkit'
import { speakText } from '../../domain/speech-output'

function assistantItemText(item: ThreadItem): string {
  if (item.type !== 'assistant_message') return ''
  return item.content
    .flatMap((part) => part.type === 'output_text' && typeof part.text === 'string' ? [part.text] : [])
    .join('\n')
    .trim()
}

export function useAnswerReadAloud(items: readonly ThreadItem[]) {
  const [isReading, setIsReading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const latestText = useMemo(() => {
    for (let index = items.length - 1; index >= 0; index -= 1) {
      const text = assistantItemText(items[index])
      if (text) return text
    }
    return ''
  }, [items])

  const toggle = useCallback(() => {
    if (isReading) {
      abortRef.current?.abort()
      abortRef.current = null
      window.speechSynthesis?.cancel()
      setIsReading(false)
      return
    }
    if (!latestText) return
    const controller = new AbortController()
    abortRef.current = controller
    setError(null)
    setIsReading(true)
    void speakText(latestText, controller.signal).catch((reason) => {
      if (!(reason instanceof DOMException && reason.name === 'AbortError')) {
        setError(reason instanceof Error ? reason.message : '回答朗读失败。')
      }
    }).finally(() => {
      if (abortRef.current === controller) abortRef.current = null
      setIsReading(false)
    })
  }, [isReading, latestText])

  useEffect(() => () => {
    abortRef.current?.abort()
    window.speechSynthesis?.cancel()
  }, [])

  return { latestText, isReading, error, toggle }
}
