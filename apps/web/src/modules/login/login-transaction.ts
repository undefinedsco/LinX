import { defaultAppletId, isValidAppletId, type AppletId } from '@/modules/layout/applet-registry'

export type LoginRoute = 'cloud' | 'local' | 'standalone' | 'custom'
export type AuthorizationSurface = 'window' | 'embedded' | 'external'

export interface LoginTransaction {
  id: string
  route: LoginRoute
  oidcEntryUrl: string
  oidcIssuerUrl: string
  accountIssuerUrl: string
  accountIssuerLabel?: string
  authorizationSurface: AuthorizationSurface
  returnToAppletId: AppletId
  storageProviderUrl: string
  storageProviderLabel?: string
  authorizationQuery?: Record<string, string>
  prompt?: 'none' | 'consent'
  strictDiscovery?: boolean
  nodeId?: string
  createdAt: number
}

export interface LoginTransactionInput {
  route?: LoginRoute
  oidcEntryUrl?: string | null
  oidcIssuerUrl?: string | null
  issuerUrl?: string | null
  accountIssuerUrl?: string | null
  accountIssuerLabel?: string | null
  authorizationSurface?: AuthorizationSurface | null
  returnToAppletId?: AppletId | string | null
  storageProviderUrl?: string | null
  providerUrl?: string | null
  storageProviderLabel?: string | null
  providerLabel?: string | null
  authorizationQuery?: unknown
  prompt?: 'none' | 'consent' | string | null
  strictDiscovery?: boolean | null
  nodeId?: string | null
  id?: string | null
  createdAt?: number | null
}

export function createLoginTransaction(input: LoginTransactionInput): LoginTransaction | null {
  let oidcIssuerUrl = normalizeLoginUrl(input.oidcIssuerUrl)
    ?? normalizeLoginUrl(input.issuerUrl)
    ?? normalizeLoginUrl(input.oidcEntryUrl)
  if (!oidcIssuerUrl) return null

  const storageProviderUrl = normalizeLoginUrl(input.storageProviderUrl)
    ?? normalizeLoginUrl(input.providerUrl)
    ?? normalizeLoginUrl(input.oidcEntryUrl)
    ?? oidcIssuerUrl
  const accountIssuerUrl = normalizeLoginUrl(input.accountIssuerUrl) ?? oidcIssuerUrl
  const storageProviderLabel = normalizeLabel(input.storageProviderLabel) ?? normalizeLabel(input.providerLabel)
  const accountIssuerLabel = normalizeLabel(input.accountIssuerLabel)
  const route = input.route ?? inferLoginRoute({
    oidcEntryUrl: input.oidcEntryUrl,
    oidcIssuerUrl,
    accountIssuerUrl,
    storageProviderUrl,
    storageProviderLabel,
    accountIssuerLabel,
  })
  if (route === 'local' && accountIssuerUrl && normalizeOrigin(accountIssuerUrl) !== normalizeOrigin(storageProviderUrl)) {
    oidcIssuerUrl = accountIssuerUrl
  }
  const explicitOidcEntryUrl = normalizeLoginUrl(input.oidcEntryUrl)
  const oidcEntryUrl = route === 'local'
    && explicitOidcEntryUrl
    && normalizeOrigin(explicitOidcEntryUrl) === normalizeOrigin(storageProviderUrl)
    && normalizeOrigin(accountIssuerUrl) !== normalizeOrigin(storageProviderUrl)
      ? oidcIssuerUrl
      : explicitOidcEntryUrl ?? oidcIssuerUrl
  const authorizationSurface = isAuthorizationSurface(input.authorizationSurface)
    ? input.authorizationSurface
    : 'window'
  const returnToAppletId = isValidAppletId(input.returnToAppletId ?? undefined)
    ? input.returnToAppletId as AppletId
    : defaultAppletId
  const authorizationQuery = sanitizeAuthorizationQuery(input.authorizationQuery)
  const createdAt = typeof input.createdAt === 'number' && Number.isFinite(input.createdAt) && input.createdAt > 0
    ? input.createdAt
    : Date.now()
  const id = normalizeLabel(input.id) ?? createLoginTransactionId(createdAt)
  const prompt = input.prompt === 'none' || input.prompt === 'consent' ? input.prompt : undefined
  const nodeId = normalizeLabel(input.nodeId)

  return {
    id,
    route,
    oidcEntryUrl,
    oidcIssuerUrl,
    accountIssuerUrl,
    ...(accountIssuerLabel ? { accountIssuerLabel } : {}),
    authorizationSurface,
    returnToAppletId,
    storageProviderUrl,
    ...(storageProviderLabel ? { storageProviderLabel } : {}),
    ...(authorizationQuery ? { authorizationQuery } : {}),
    ...(prompt ? { prompt } : {}),
    ...(input.strictDiscovery === true ? { strictDiscovery: true } : {}),
    ...(nodeId ? { nodeId } : {}),
    createdAt,
  }
}

export function normalizeLoginTransaction(value: unknown): LoginTransaction | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }

  return createLoginTransaction(value as LoginTransactionInput)
}

export function inferLoginRoute(input: {
  oidcEntryUrl?: string | null
  oidcIssuerUrl?: string | null
  accountIssuerUrl?: string | null
  storageProviderUrl?: string | null
  storageProviderLabel?: string | null
  accountIssuerLabel?: string | null
}): LoginRoute {
  const storageLabel = normalizeLabel(input.storageProviderLabel)?.toLowerCase()
  if (storageLabel === 'local') return 'local'
  if (storageLabel === 'standalone') return 'standalone'
  if (storageLabel === 'cloud') return 'cloud'

  const accountLabel = normalizeLabel(input.accountIssuerLabel)?.toLowerCase()
  if (accountLabel === 'standalone') return 'standalone'

  const entryOrigin = normalizeOrigin(input.oidcEntryUrl)
  const issuerOrigin = normalizeOrigin(input.oidcIssuerUrl)
  const accountOrigin = normalizeOrigin(input.accountIssuerUrl)
  const storageOrigin = normalizeOrigin(input.storageProviderUrl)
  const identityOrigin = accountOrigin ?? issuerOrigin

  if (storageOrigin && identityOrigin && storageOrigin !== identityOrigin) {
    return 'local'
  }

  if (entryOrigin && storageOrigin && entryOrigin !== storageOrigin && identityOrigin === storageOrigin) {
    return 'custom'
  }

  if (storageOrigin === 'https://id.undefineds.co') {
    return 'cloud'
  }

  return 'custom'
}

export function getLoginTransactionRetryEntryUrl(transaction: LoginTransaction): string {
  return transaction.oidcEntryUrl || transaction.storageProviderUrl || transaction.oidcIssuerUrl
}

export function isLocalLoginTransaction(transaction: LoginTransaction | null | undefined): boolean {
  return transaction?.route === 'local' || transaction?.route === 'standalone'
}

export function isSplitLocalLoginTransaction(transaction: LoginTransaction | null | undefined): boolean {
  return transaction?.route === 'local'
}

export function sanitizeAuthorizationQuery(value: unknown): Record<string, string> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined

  const entries = Object.entries(value as Record<string, unknown>).filter(
    ([key, entryValue]) => key.length > 0 && typeof entryValue === 'string' && entryValue.length > 0,
  ) as Array<[string, string]>
  if (entries.length === 0) return undefined
  return Object.fromEntries(entries)
}

export function normalizeLoginUrl(url?: string | null): string | null {
  if (typeof url !== 'string') return null
  const trimmed = url.trim()
  return trimmed.length > 0 ? trimmed.replace(/\/$/, '') : null
}

function normalizeLabel(value?: string | null): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function isAuthorizationSurface(value: unknown): value is AuthorizationSurface {
  return value === 'window' || value === 'embedded' || value === 'external'
}

function createLoginTransactionId(createdAt: number): string {
  const cryptoApi = typeof crypto !== 'undefined' ? crypto : undefined
  if (cryptoApi?.randomUUID) {
    return cryptoApi.randomUUID()
  }

  return `login-${createdAt.toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function normalizeOrigin(url?: string | null): string | null {
  try {
    const normalized = normalizeLoginUrl(url)
    return normalized ? new URL(normalized).origin : null
  } catch {
    return null
  }
}
