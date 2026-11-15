import { useEffect, useMemo, useRef } from 'react'
import { useLoginStore } from '@linx/stores/login'
import { getStoredSolidSession } from '@/modules/login/login-utils'
import { resolveCurrentPodBaseUrl } from '@/lib/data/current-pod-base'
import { useSession } from '@/providers/solid-session-context'
import { useSolidDatabase } from '@/providers/solid-database-provider'
import {
  createMatrixInterfaceAccess,
  releaseAllMatrixInterfaceCredentials,
  releaseStaleMatrixInterfaceCredentials,
  resolveMatrixAccountOrigin,
  resolveMatrixInterfaceScope,
  type MatrixInterfaceAccess,
} from './pod-interface-access'

/**
 * The current browser session's Pod interface credential for Matrix group chat.
 *
 * The credential is not created on mount: callers must call `authorize()` from an
 * explicit user action. The access object is isolated by WebID, Account authority,
 * Pod origin, and session so a credential can never be reused after switching
 * account or space, and cached credentials are dropped (best-effort revoked) when
 * the session changes or the user logs out.
 */
export function usePodInterfaceAccess(): MatrixInterfaceAccess | null {
  const { session } = useSession()
  const { db } = useSolidDatabase()
  const storedAccount = useLoginStore((state) => state.storedAccount)
  const webId = session.info.webId
  const sessionId = session.info.sessionId
  const sessionFetch = session.fetch
  const podUrl = db ? resolveCurrentPodBaseUrl(db) : null

  // Issuer comes from the persisted DPoP session of this exact login, then from
  // the remembered account only when it names the same WebID. Never from the Pod.
  const accountOrigin = useMemo(
    () => resolveMatrixAccountOrigin({
      ...(webId ? { webId } : {}),
      ...(sessionId ? { sessionId } : {}),
      storedSession: typeof window === 'undefined' ? null : getStoredSolidSession(),
      rememberedAccount: storedAccount,
    }),
    [sessionId, storedAccount, webId],
  )

  const access = useMemo(
    () => createMatrixInterfaceAccess({
      webId,
      podUrl,
      accountOrigin,
      ...(sessionId ? { sessionId } : {}),
      sessionFetch,
    }),
    [accountOrigin, podUrl, sessionFetch, sessionId, webId],
  )

  const previousScopeRef = useRef<string | null>(null)
  useEffect(() => {
    const scope = resolveMatrixInterfaceScope(webId, podUrl, sessionId, accountOrigin)
    const key = scope
      ? `${scope.webId}\n${scope.accountOrigin}\n${scope.origin}\n${scope.sessionId ?? ''}`
      : null
    const previous = previousScopeRef.current
    previousScopeRef.current = key
    if (!sessionFetch) return
    if (webId) {
      void releaseStaleMatrixInterfaceCredentials({ scope, sessionFetch })
    } else if (previous) {
      // Logout or lost session: revoke whatever this page still holds.
      void releaseAllMatrixInterfaceCredentials({ sessionFetch })
    }
  }, [accountOrigin, podUrl, sessionFetch, sessionId, webId])

  return podUrl && webId && accountOrigin ? access : null
}
