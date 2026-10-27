/**
 * Scope a user-facing OIDC approval count to the provider's Account consent page.
 *
 * Xpod routes consent through `/.account/oidc/consent/` on older builds and
 * `/.account/interaction/<id>/oidc/consent/` on newer builds. During a fresh
 * single-identity browser sign-in that is the only screen whose primary action
 * is the user approving this application; the Account dashboard's Continue,
 * later Pod-interface-key / Matrix grants and the LinX app's own buttons are
 * not OIDC consent and must not be counted.
 */

const OIDC_CONSENT_PATH = /^\/\.account\/(?:interaction\/[^/?#]+\/)?oidc\/consent\/?$/u

function providerOrigin(value: string): string {
  try {
    return new URL(value).origin
  } catch {
    throw new Error('OIDC approval guard requires a valid provider origin')
  }
}

/** True only for the exact provider origin and an Account OIDC consent route. */
export function isAccountOidcConsentUrl(url: string | URL, expectedProviderOrigin: string): boolean {
  let candidate: URL
  try {
    candidate = new URL(String(url))
  } catch {
    return false
  }
  return candidate.origin === providerOrigin(expectedProviderOrigin)
    && OIDC_CONSENT_PATH.test(candidate.pathname)
}

export function oidcApprovalLimitMessage(observed: number, max: number): string {
  return `seeded xpod OIDC consent: observed ${observed} user-facing approval action(s); `
    + `expected at most ${max} for this fresh single-identity sign-in`
}

export interface OidcApprovalGuardOptions {
  providerOrigin: string
  /** Unset keeps the generic sign-in flow uncapped, as before this guard. */
  maxApprovalActions?: number
}

export interface OidcApprovalGuard {
  readonly count: number
  readonly max: number | undefined
  /** Whether the next action would count as an Account OIDC approval. */
  qualifies(url: string | URL): boolean
  /**
   * Called immediately before clicking a visible approval action. Throws a
   * fixed, secret-free count error instead of performing an over-limit click.
   */
  beforeApproval(url: string | URL): number
}

export function createOidcApprovalGuard(options: OidcApprovalGuardOptions): OidcApprovalGuard {
  const expectedOrigin = providerOrigin(options.providerOrigin)
  const max = options.maxApprovalActions
  if (max !== undefined && (!Number.isInteger(max) || max < 0)) {
    throw new Error('OIDC approval guard maximum must be a non-negative integer')
  }

  let count = 0
  const qualifies = (url: string | URL): boolean => isAccountOidcConsentUrl(url, expectedOrigin)

  return {
    get count() {
      return count
    },
    max,
    qualifies,
    beforeApproval(url: string | URL): number {
      if (!qualifies(url)) return count
      const next = count + 1
      if (max !== undefined && next > max) {
        throw new Error(oidcApprovalLimitMessage(next, max))
      }
      count = next
      return count
    },
  }
}


/** Allow-listed, credential-free summary of a failed seeded sign-in. */
export interface SeededLoginFailureSummary {
  url: string
  title: string
  dbReady: boolean
  dbStatus: string | null
  dbError: '[error-present]' | null
  dbPodUrl: string | null
  dbAuthFetchReady: boolean
  currentSessionReady: boolean
  storedAccountWebId: string | null
}

function publicUrl(value: unknown, keepHash = false): string | null {
  if (typeof value !== 'string' || !value) return null
  try {
    const url = new URL(value)
    url.username = ''
    url.password = ''
    url.search = ''
    if (!keepHash) url.hash = ''
    return url.href
  } catch {
    return '[invalid-url]'
  }
}

function pagePath(value: unknown): string {
  if (typeof value !== 'string' || !value) return '[invalid-url]'
  try {
    const url = new URL(value)
    return `${url.origin}${url.pathname}`
  } catch {
    return '[invalid-url]'
  }
}

/**
 * Builds the only failure output allowed in logs. Arbitrary error text can
 * embed opaque credentials (`sk-…`, client secrets, tokens), so it is replaced
 * by a fixed marker: successful runs keep `dbError: null` assertions intact.
 */
export function summarizeSeededLoginFailure(state: unknown): SeededLoginFailureSummary {
  const record = (typeof state === 'object' && state !== null ? state : {}) as Record<string, unknown>
  const rawLoginStore = record.loginStore as
    | { state?: { storedAccount?: { webId?: unknown } } }
    | null
    | undefined
  return {
    url: pagePath(record.url),
    title: typeof record.title === 'string' ? record.title : '',
    dbReady: record.dbReady === true,
    dbStatus: typeof record.dbStatus === 'string' ? record.dbStatus : null,
    dbError: typeof record.dbError === 'string' && record.dbError.length > 0 ? '[error-present]' : null,
    dbPodUrl: publicUrl(record.dbPodUrl),
    dbAuthFetchReady: record.dbAuthFetchReady === true,
    currentSessionReady: record.currentSessionReady === true,
    storedAccountWebId: publicUrl(rawLoginStore?.state?.storedAccount?.webId, true),
  }
}
