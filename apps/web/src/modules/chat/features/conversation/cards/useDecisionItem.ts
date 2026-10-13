import { useEffect, useMemo, useState } from 'react'
import { useInboxItems } from '@/modules/inbox/collections'
import type { InboxItem } from '@/modules/inbox/domain/inbox-item'
import { resourceMatches } from './card-model'

export type DecisionLookup =
  | { state: 'loading' }
  | { state: 'missing' }
  | { state: 'ready'; item: InboxItem }

function itemMatches(item: InboxItem, uri: string): boolean {
  if (item.approval && resourceMatches(item.approval.id, uri)) return true
  if (item.inputRequest && resourceMatches(item.inputRequest.id, uri)) return true
  const bare = item.id.replace(/^[a-z_]+:/u, '')
  return bare.length > 0 && resourceMatches(bare, uri)
}

/** The approval / input request a card is bound to, read live from the Pod. */
export function useDecisionItem(uri: string, hintToolCallId?: string): DecisionLookup {
  const { data, isLoading } = useInboxItems('all')
  return useMemo<DecisionLookup>(() => {
    const item = data.find((candidate) => itemMatches(candidate, uri))
      ?? (hintToolCallId ? data.find((candidate) => candidate.approval?.toolCallId === hintToolCallId) : undefined)
    if (item) return { state: 'ready', item }
    return isLoading ? { state: 'loading' } : { state: 'missing' }
  }, [data, hintToolCallId, isLoading, uri])
}

/** A clock for countdowns. */
export function useNow(intervalMs: number, enabled = true): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!enabled) return
    setNow(Date.now())
    const timer = window.setInterval(() => setNow(Date.now()), intervalMs)
    return () => window.clearInterval(timer)
  }, [enabled, intervalMs])
  return now
}
