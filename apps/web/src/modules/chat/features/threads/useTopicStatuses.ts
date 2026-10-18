import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useInboxItems } from '@/modules/inbox/collections'
import { isActionableInboxItem } from '@/modules/inbox/utils'
import { useLinxDefaultSecretaryBootstrapSettling } from '../../collections'
import {
  isRuntimeSessionMode,
  listRuntimeSessions,
  type RuntimeSessionRecord,
} from '../../runtime-client'
import { projectTopicStatus, type TopicSignals, type TopicStatus } from '../../domain/topic-status'

export const RUNTIME_SESSIONS_QUERY_KEY = ['runtime-sessions'] as const

function compareRuntimeSessions(left: RuntimeSessionRecord, right: RuntimeSessionRecord): number {
  const leftTime = new Date(left.lastActivityAt || left.updatedAt || left.createdAt).getTime()
  const rightTime = new Date(right.lastActivityAt || right.updatedAt || right.createdAt).getTime()
  return rightTime - leftTime
}

/** Every runtime session the local service knows, refreshed while it runs. */
export function useRuntimeSessionIndex() {
  const runtimeMode = isRuntimeSessionMode()
  const { data = [] } = useQuery({
    queryKey: RUNTIME_SESSIONS_QUERY_KEY,
    queryFn: () => listRuntimeSessions(),
    enabled: runtimeMode,
    refetchInterval: 5000,
  })
  return useMemo(() => {
    const byThread = new Map<string, RuntimeSessionRecord>()
    for (const session of data) {
      const previous = byThread.get(session.threadId)
      if (!previous || compareRuntimeSessions(previous, session) > 0) byThread.set(session.threadId, session)
    }
    return byThread
  }, [data])
}

export interface TopicStatusIndex {
  byThread: Map<string, TopicStatus>
  /** Requests that name a conversation but no topic. */
  byChat: Map<string, TopicStatus>
  runtimeByThread: Map<string, RuntimeSessionRecord>
}

/** What each topic is waiting on (decisions, answers, logins) or doing (a running tool). */
export function useTopicStatuses(): TopicStatusIndex {
  const settling = useLinxDefaultSecretaryBootstrapSettling()
  const { data: inboxItems = [] } = useInboxItems('all', { enabled: !settling })
  const runtimeByThread = useRuntimeSessionIndex()

  return useMemo(() => {
    const threadSignals = new Map<string, TopicSignals>()
    const chatSignals = new Map<string, TopicSignals>()
    const bump = (map: Map<string, TopicSignals>, key: string, field: keyof Omit<TopicSignals, 'runtime'>) => {
      const signals = map.get(key) ?? {}
      signals[field] = (signals[field] ?? 0) + 1
      map.set(key, signals)
    }

    for (const item of inboxItems) {
      if (!isActionableInboxItem(item)) continue
      const field = item.category === 'auth_required'
        ? 'pendingLogins'
        : item.kind === 'approval'
          ? 'pendingApprovals'
          : item.kind === 'input_request'
            ? 'pendingInputs'
            : null
      if (!field) continue
      if (item.threadId) bump(threadSignals, item.threadId, field)
      else if (item.chatId) bump(chatSignals, item.chatId, field)
    }

    for (const [threadId, session] of runtimeByThread) {
      const signals = threadSignals.get(threadId) ?? {}
      signals.runtime = { status: session.status, tool: session.tool }
      threadSignals.set(threadId, signals)
    }

    const project = (map: Map<string, TopicSignals>) => {
      const result = new Map<string, TopicStatus>()
      for (const [key, signals] of map) {
        const status = projectTopicStatus(signals)
        if (status) result.set(key, status)
      }
      return result
    }

    return { byThread: project(threadSignals), byChat: project(chatSignals), runtimeByThread }
  }, [inboxItems, runtimeByThread])
}
