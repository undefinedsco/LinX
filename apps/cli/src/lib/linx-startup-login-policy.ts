import { isOidcLoginExpiredError, isOidcTransientRemoteError } from './oidc-auth.js'
import { loadCredentials } from './credentials-store.js'
import type { PodDataSession } from './pod-data-session.js'

export type LinxStartupLoginPromptDecision =
  | { shouldPrompt: false; reason: 'print-mode' | 'native-backend' | 'credential-present' }
  | { shouldPrompt: true; reason: 'missing-credential' | 'expired-credential' }

export type LinxStartupLoginReason = 'startup' | 'expired' | null

export async function resolveLinxStartupLoginPromptDecision(options: {
  backend: 'cloud' | 'native'
  print?: boolean
  issuerUrl?: string
  resolveSession?: () => Promise<Pick<PodDataSession, 'close'> | null>
  loadStoredCredentials?: typeof loadCredentials
}): Promise<LinxStartupLoginPromptDecision> {
  if (options.print) {
    return { shouldPrompt: false, reason: 'print-mode' }
  }
  if (options.backend === 'native') {
    return { shouldPrompt: false, reason: 'native-backend' }
  }

  if (!options.resolveSession) {
    return (options.loadStoredCredentials ?? loadCredentials)()
      ? { shouldPrompt: false, reason: 'credential-present' }
      : { shouldPrompt: true, reason: 'missing-credential' }
  }

  const resolveSession = options.resolveSession
  let session: Pick<PodDataSession, 'close'> | null = null
  try {
    session = await resolveSession()
    return session
      ? { shouldPrompt: false, reason: 'credential-present' }
      : { shouldPrompt: true, reason: 'missing-credential' }
  } catch (error) {
    if (isOidcLoginExpiredError(error)) {
      return { shouldPrompt: true, reason: 'expired-credential' }
    }
    if (isOidcTransientRemoteError(error) && (options.loadStoredCredentials ?? loadCredentials)()) {
      return { shouldPrompt: false, reason: 'credential-present' }
    }
    throw error
  } finally {
    await session?.close().catch(() => undefined)
  }
}

export function resolveLinxStartupLoginReason(
  decision: LinxStartupLoginPromptDecision,
): LinxStartupLoginReason {
  if (!decision.shouldPrompt) {
    return null
  }

  return decision.reason === 'expired-credential' ? 'expired' : 'startup'
}

export function resolveLinxInteractiveLoginReason(options: {
  startupDecision: LinxStartupLoginPromptDecision
  runtimePromptOnStart?: boolean
}): LinxStartupLoginReason {
  if (options.runtimePromptOnStart) {
    return 'expired'
  }

  return resolveLinxStartupLoginReason(options.startupDecision)
}
