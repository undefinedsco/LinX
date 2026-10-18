/**
 * Live merge of the chat's other internal threads.
 *
 * The timeline shows every internal thread of the chat, but the surface only
 * sends into one of them. A message that lands elsewhere (a scheduled run, a
 * coding run, a reconciler reply in a group) reaches the Pod and, through Pod
 * notifications, the live message collection (`useChatMessageRows`). This hook
 * notices rows the agent has not seen and asks the surface to merge the Pod
 * state into the running thread (`refresh` → `thread.import`), never while a
 * run of our own is in flight.
 */
import { useEffect, useRef } from 'react'
import type { LinxConversationAgent } from './ag-ui/agent'

interface LiveRow { id?: string | null }

export function useLiveChatSync({ agent, rows, ready, refresh }: {
  agent: Pick<LinxConversationAgent, 'messageKnower' | 'whenIdle'>
  rows: readonly LiveRow[]
  /** The first history load finished; before that everything is "new". */
  ready: boolean
  refresh: () => Promise<void>
}) {
  // Rows that stayed unknown after a refresh (not shown as messages, e.g. tool
  // bookkeeping) must not trigger another refresh forever.
  const settledRef = useRef(new Set<string>())
  const refreshRef = useRef(refresh)
  refreshRef.current = refresh
  useEffect(() => { settledRef.current = new Set() }, [agent])

  useEffect(() => {
    if (!ready) return
    const unseen = (known: (rowId: string) => boolean) => rows.flatMap((row) => (
      row.id && !known(row.id) && !settledRef.current.has(row.id) ? [row.id] : []
    ))
    if (unseen(agent.messageKnower()).length === 0) return
    let cancelled = false
    void (async () => {
      // Our own run writes its rows before the agent has registered them.
      await agent.whenIdle()
      if (cancelled || unseen(agent.messageKnower()).length === 0) return
      try {
        await refreshRef.current()
      } catch {
        return // the next change (or the reconnect probe) tries again
      }
      const known = agent.messageKnower()
      for (const row of rows) if (row.id && !known(row.id)) settledRef.current.add(row.id)
    })()
    return () => { cancelled = true }
  }, [agent, ready, rows])
}
