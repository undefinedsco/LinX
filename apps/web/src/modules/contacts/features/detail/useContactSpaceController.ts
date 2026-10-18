import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSession } from '@/providers/solid-session-context'
import { contactOps } from '../../data/collections'
import {
  probeContactAccess,
  readPublicKnows,
  revokeContactAccess,
  setPublicKnows,
} from '../../data/contact-access'
import {
  summarizeContactAccess,
  type ContactAccessProbe,
  type ContactAccessSummary,
} from '../../domain/contact-access'
import type { ContactDetailNotifier } from './controller-types'

type Loadable = 'loading' | 'ready'

interface ContactSpaceControllerOptions {
  /** The person's account; null for groups and anything without one. */
  contactWebId: string | null
  contactId: string | null
  /** What the contact row says about "show in my public profile". */
  storedShowInProfile: boolean
  notify: ContactDetailNotifier
}

export interface ContactSpaceState {
  summary: ContactAccessSummary
  isLoading: boolean
  /** null when the public profile could not be read */
  showInProfile: boolean | null
  isUpdatingProfile: boolean
  isRevoking: boolean
  onToggleShowInProfile(checked: boolean): void
  onRevokeAll(): Promise<boolean>
  onReload(): void
}

/** Reads what a person can do in my space and applies the changes made from "TA 的空间与权限". */
export function useContactSpaceController({
  contactWebId,
  contactId,
  storedShowInProfile,
  notify,
}: ContactSpaceControllerOptions): ContactSpaceState {
  const { session } = useSession()
  const ownerWebId = session.info.webId ?? null
  const [probe, setProbe] = useState<ContactAccessProbe | null>(null)
  const [knows, setKnows] = useState<string[] | null>(null)
  const [status, setStatus] = useState<Loadable>('loading')
  const [reloadToken, setReloadToken] = useState(0)
  const [isUpdatingProfile, setIsUpdatingProfile] = useState(false)
  const [isRevoking, setIsRevoking] = useState(false)

  useEffect(() => {
    if (!contactWebId || !ownerWebId) {
      setProbe(null)
      setKnows(null)
      setStatus('ready')
      return
    }
    let active = true
    setStatus('loading')
    const authFetch = contactOps.getAuthFetch()
    void Promise.all([
      probeContactAccess({
        authFetch,
        contactWebId,
        spaceRootUrl: contactOps.getSpaceRootUrl(),
        ownerWebId,
      }),
      readPublicKnows({ authFetch, ownerWebId }),
    ]).then(([nextProbe, nextKnows]) => {
      if (!active) return
      setProbe(nextProbe)
      setKnows(nextKnows)
      setStatus('ready')
    }).catch(() => {
      if (!active) return
      setProbe(null)
      setKnows(null)
      setStatus('ready')
    })
    return () => {
      active = false
    }
  }, [contactWebId, ownerWebId, reloadToken])

  const summary = useMemo(() => summarizeContactAccess(probe), [probe])
  const onReload = useCallback(() => setReloadToken((value) => value + 1), [])

  const showInProfile = useMemo(() => {
    if (!contactWebId) return null
    if (knows === null) return ownerWebId ? null : storedShowInProfile
    return knows.some((entry) => entry.replace(/\/$/, '') === contactWebId.replace(/\/$/, ''))
  }, [contactWebId, knows, ownerWebId, storedShowInProfile])

  const onToggleShowInProfile = useCallback(async (checked: boolean) => {
    if (!contactWebId || !ownerWebId || !contactId) return
    setIsUpdatingProfile(true)
    try {
      await setPublicKnows({
        authFetch: contactOps.getAuthFetch(),
        ownerWebId,
        contactWebId,
        show: checked,
      })
      await contactOps.updateContact(contactId, { isPublic: checked }).catch(() => undefined)
      setKnows((current) => {
        const rest = (current ?? []).filter((entry) => entry !== contactWebId)
        return checked ? [...rest, contactWebId] : rest
      })
      notify.success(checked ? '已在你的公开资料里显示 TA' : '已不再在公开资料里显示 TA')
    } catch {
      notify.error('没改成，请稍后再试')
    } finally {
      setIsUpdatingProfile(false)
    }
  }, [contactId, contactWebId, notify, ownerWebId])

  const onRevokeAll = useCallback(async () => {
    if (!contactWebId || !probe) return true
    setIsRevoking(true)
    try {
      const result = await revokeContactAccess({
        authFetch: contactOps.getAuthFetch(),
        contactWebId,
        items: probe.items,
      })
      onReload()
      if (result.failed > 0) {
        notify.error('有些共享没能收回，请稍后再试')
        return false
      }
      notify.success('已收回')
      return true
    } finally {
      setIsRevoking(false)
    }
  }, [contactWebId, notify, onReload, probe])

  return {
    summary,
    isLoading: status === 'loading',
    showInProfile,
    isUpdatingProfile,
    isRevoking,
    onToggleShowInProfile: (checked) => { void onToggleShowInProfile(checked) },
    onRevokeAll,
    onReload,
  }
}
