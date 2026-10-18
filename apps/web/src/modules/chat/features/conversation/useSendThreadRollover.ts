import { useCallback, useRef } from 'react'
import { useChatMessageRows, useThreadList } from '../../collections'
import { rolloverThreadIfNeeded } from './thread-rollover'

/**
 * The chat's live message rows, plus the hook the agent calls before sending:
 * it starts a successor internal thread when the current one is too long or
 * idle (see chat-threads.ts) and tells the owner where messages go now.
 */
export function useSendThreadRollover(chatId: string, onSendThreadChanged?: (threadId: string) => void) {
  const threads = useThreadList(chatId).data
  const chatRows = useChatMessageRows(chatId)
  const threadsRef = useRef(threads)
  const rowsRef = useRef(chatRows)
  const changedRef = useRef(onSendThreadChanged)
  threadsRef.current = threads
  rowsRef.current = chatRows
  changedRef.current = onSendThreadChanged
  const prepareSendThread = useCallback(async (current: string) => {
    const next = await rolloverThreadIfNeeded({
      chatId,
      currentThreadId: current,
      threads: threadsRef.current,
      rows: rowsRef.current,
    })
    if (next) changedRef.current?.(next)
    return next
  }, [chatId])
  return { chatRows, prepareSendThread }
}
