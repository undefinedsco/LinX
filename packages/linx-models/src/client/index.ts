export type LinxAuthType = 'client_credentials' | 'oidc_oauth'

export interface LinxClientConfig {
  url: string
  webId: string
  authType: LinxAuthType
}

export interface LinxClientCredentialsSecrets {
  clientId: string
  clientSecret: string
}

export interface LinxOidcOAuthSecrets {
  oidcRefreshToken: string
  oidcAccessToken: string
  oidcExpiresAt: string
}

export type LinxClientSecrets = LinxClientCredentialsSecrets | LinxOidcOAuthSecrets

export interface AccountSession {
  url: string
  email: string
  token: string
  webId?: string
  podUrl?: string
  createdAt: string
}

export interface LinxAccountControls {
  pod?: string
  clientCredentials?: string
}

export interface LinxAccountData {
  controls: LinxAccountControls
  pods: Record<string, string>
  webIds: Record<string, string>
  clientCredentials: Record<string, string>
}

export interface LinxClientCredential {
  id: string
  secret?: string
  label?: string
  webId?: string
}

export interface LinxStoredCredentials {
  url: string
  webId: string
  authType: LinxAuthType
  secrets: LinxClientSecrets
}

export type LinxCredentialBootstrapStatus = 'reused' | 'created' | 'recreated'

export interface LinxWhoAmIField {
  key: 'email' | 'server' | 'webId' | 'pod' | 'session-created-at'
  value: string
}

export interface PerformLinxPasswordLoginInput {
  baseUrl?: string | null
  fallbackBaseUrl?: string
  email: string
  password: string
  requestedWebId?: string | null
  credentialName?: string | null
  existingCredentials?: LinxStoredCredentials | null
  now?: Date
}

export interface PerformLinxPasswordLoginResult {
  baseUrl: string
  webId: string
  account: LinxAccountData
  session: AccountSession
  credentialStatus: LinxCredentialBootstrapStatus
  credentialsToSave?: {
    url: string
    webId: string
    authType: 'client_credentials'
    secrets: LinxClientCredentialsSecrets
  }
}

export interface PerformLinxPasswordLoginDependencies {
  checkServer(baseUrl: string): Promise<boolean>
  login(email: string, password: string, baseUrl: string): Promise<string | null>
  getAccountData(token: string, baseUrl: string): Promise<LinxAccountData | null>
  validateClientCredentials?(credentials: LinxStoredCredentials): Promise<boolean>
  createClientCredentials(
    token: string,
    credentialsUrl: string,
    webId: string,
    name?: string,
  ): Promise<LinxClientCredential | null>
}

export const LINX_HOME_DIRNAME = '.linx'
export const LINX_CONFIG_FILE_NAME = 'config.json'
export const LINX_SECRETS_FILE_NAME = 'secrets.json'
export const LINX_ACCOUNT_SESSION_FILE_NAME = 'account.json'
export const LINX_CLOUD_IDENTITY_ORIGIN = 'https://id.undefineds.co'
export const LINX_CLOUD_API_ORIGIN = 'https://api.undefineds.co'
export const LINX_CLOUD_ACCOUNT_API_BASE_URL = `${LINX_CLOUD_IDENTITY_ORIGIN}/`
export const LINX_CLOUD_RUNTIME_API_BASE_URL = `${LINX_CLOUD_API_ORIGIN}/v1`
export const LINX_CLOUD_API_BASE_URL = LINX_CLOUD_ACCOUNT_API_BASE_URL
export const LINX_CLOUD_IDENTITY_HOSTS = ['id.undefineds.co'] as const

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function parseStringRecord(value: unknown): Record<string, string> {
  if (!isRecord(value)) {
    return {}
  }

  const entries = Object.entries(value)
    .filter((entry): entry is [string, string] => typeof entry[1] === 'string')

  return Object.fromEntries(entries)
}

function normalizeAuthType(value: unknown): LinxAuthType {
  return value === 'oidc_oauth' ? 'oidc_oauth' : 'client_credentials'
}

function trimTrailingSlash(url: string): string {
  return url.replace(/\/+$/, '')
}

function resolveHostname(url: string): string {
  try {
    return new URL(url).hostname
  } catch {
    return ''
  }
}

export function resolveLinxBaseUrl(url?: string | null, fallbackBaseUrl = 'http://localhost:3000'): string {
  const raw = typeof url === 'string' && url.trim() ? url.trim() : fallbackBaseUrl
  return raw.endsWith('/') ? raw : `${raw}/`
}

export function resolveLinxRuntimeApiBaseUrl(url?: string | null, fallbackBaseUrl = LINX_CLOUD_ACCOUNT_API_BASE_URL): string {
  const normalized = trimTrailingSlash(resolveLinxBaseUrl(url, fallbackBaseUrl))
  return normalized.endsWith('/v1') ? normalized : `${normalized}/v1`
}

export function resolveLinxCloudAccountBaseUrl(url?: string | null): string {
  return resolveLinxBaseUrl(url, LINX_CLOUD_ACCOUNT_API_BASE_URL)
}

export function resolveLinxCloudRuntimeApiBaseUrl(url?: string | null): string {
  return resolveLinxRuntimeApiBaseUrl(url, LINX_CLOUD_RUNTIME_API_BASE_URL)
}

export function resolveLinxCloudApiBaseUrl(url?: string | null): string {
  return resolveLinxCloudAccountBaseUrl(url)
}

export function isLinxCloudIdentityBaseUrl(url?: string | null): boolean {
  const normalized = resolveLinxBaseUrl(url, LINX_CLOUD_ACCOUNT_API_BASE_URL)
  const hostname = resolveHostname(normalized)
  return LINX_CLOUD_IDENTITY_HOSTS.includes(hostname as typeof LINX_CLOUD_IDENTITY_HOSTS[number])
}

export function resolveLinxRuntimeOriginForIssuerUrl(url?: string | null): string {
  const normalized = trimTrailingSlash(resolveLinxBaseUrl(url, LINX_CLOUD_ACCOUNT_API_BASE_URL))
  if (isLinxCloudIdentityBaseUrl(normalized)) {
    return LINX_CLOUD_API_ORIGIN
  }
  return normalized
}

export function resolveLinxRuntimeApiBaseUrlForIssuerUrl(url?: string | null): string {
  const runtimeOrigin = resolveLinxRuntimeOriginForIssuerUrl(url)
  return resolveLinxRuntimeApiBaseUrl(runtimeOrigin, LINX_CLOUD_RUNTIME_API_BASE_URL)
}

export function resolveLinxPodUrl(webId: string): string {
  try {
    const target = new URL(webId)
    const pathParts = target.pathname.split('/').filter(Boolean)
    return `${target.origin}/${pathParts[0] ?? ''}/`.replace(/\/+$/, '/')
  } catch {
    return ''
  }
}

export function resolveLinxPodBaseUrl(webId: string): string {
  return trimTrailingSlash(resolveLinxPodUrl(webId))
}

export function parseLinxClientConfig(raw: unknown): LinxClientConfig | null {
  if (!isRecord(raw) || typeof raw.url !== 'string' || typeof raw.webId !== 'string') {
    return null
  }

  return {
    url: raw.url,
    webId: raw.webId,
    authType: normalizeAuthType(raw.authType),
  }
}

export function isLinxClientCredentialsSecrets(secrets: LinxClientSecrets): secrets is LinxClientCredentialsSecrets {
  return 'clientId' in secrets && 'clientSecret' in secrets
}

export function isLinxOidcOAuthSecrets(secrets: LinxClientSecrets): secrets is LinxOidcOAuthSecrets {
  return 'oidcRefreshToken' in secrets && 'oidcAccessToken' in secrets && 'oidcExpiresAt' in secrets
}

export function parseLinxClientSecrets(raw: unknown): LinxClientSecrets | null {
  if (!isRecord(raw)) {
    return null
  }

  if (typeof raw.clientId === 'string' && typeof raw.clientSecret === 'string') {
    return {
      clientId: raw.clientId,
      clientSecret: raw.clientSecret,
    }
  }

  if (
    typeof raw.oidcRefreshToken === 'string'
    && typeof raw.oidcAccessToken === 'string'
    && typeof raw.oidcExpiresAt === 'string'
  ) {
    return {
      oidcRefreshToken: raw.oidcRefreshToken,
      oidcAccessToken: raw.oidcAccessToken,
      oidcExpiresAt: raw.oidcExpiresAt,
    }
  }

  return null
}

export function parseLinxAccountData(raw: unknown): LinxAccountData | null {
  if (!isRecord(raw)) {
    return null
  }

  const controls = isRecord(raw.controls) ? raw.controls : {}
  const accountControls = isRecord(controls.account) ? controls.account : controls

  return {
    controls: {
      pod: optionalString(accountControls.pod),
      clientCredentials: optionalString(accountControls.clientCredentials),
    },
    pods: parseStringRecord(raw.pods),
    webIds: parseStringRecord(raw.webIds),
    clientCredentials: parseStringRecord(raw.clientCredentials),
  }
}

export function parseLinxClientCredential(raw: unknown): LinxClientCredential | null {
  if (!isRecord(raw) || typeof raw.id !== 'string') {
    return null
  }

  return {
    id: raw.id,
    label: optionalString(raw.label),
    secret: optionalString(raw.secret),
    webId: optionalString(raw.webId),
  }
}

export function parseAccountSession(raw: unknown): AccountSession | null {
  if (
    !isRecord(raw)
    || typeof raw.url !== 'string'
    || typeof raw.email !== 'string'
    || typeof raw.token !== 'string'
    || typeof raw.createdAt !== 'string'
  ) {
    return null
  }

  return {
    url: raw.url,
    email: raw.email,
    token: raw.token,
    webId: optionalString(raw.webId),
    podUrl: optionalString(raw.podUrl),
    createdAt: raw.createdAt,
  }
}

export function selectLinxAccountWebId(account: LinxAccountData | null, preferredWebId?: string | null): string | null {
  if (typeof preferredWebId === 'string' && preferredWebId.trim()) {
    return preferredWebId.trim()
  }

  if (!account) {
    return null
  }

  return Object.keys(account.webIds)[0] ?? null
}

export function hasMatchingLinxStoredCredentials(
  credentials: Pick<LinxStoredCredentials, 'url' | 'webId'> | null | undefined,
  baseUrl: string,
  webId: string,
): boolean {
  return credentials?.url === baseUrl && credentials?.webId === webId
}

export function resolveLinxCredentialBootstrapStatus(input: {
  reusedExistingCredentials: boolean
  hadMatchingStoredCredentials: boolean
}): LinxCredentialBootstrapStatus {
  if (input.reusedExistingCredentials) {
    return 'reused'
  }

  return input.hadMatchingStoredCredentials ? 'recreated' : 'created'
}

export function listLinxWhoAmIFields(
  session: AccountSession,
  options: { verbose?: boolean } = {},
): LinxWhoAmIField[] {
  const fields: LinxWhoAmIField[] = [
    { key: 'email', value: session.email },
    { key: 'server', value: session.url },
  ]

  if (session.webId) {
    fields.push({ key: 'webId', value: session.webId })
  }

  if (options.verbose && session.podUrl) {
    fields.push({ key: 'pod', value: session.podUrl })
  }

  fields.push({ key: 'session-created-at', value: session.createdAt })
  return fields
}

export async function performLinxPasswordLogin(
  input: PerformLinxPasswordLoginInput,
  deps: PerformLinxPasswordLoginDependencies,
): Promise<PerformLinxPasswordLoginResult> {
  const baseUrl = resolveLinxBaseUrl(input.baseUrl, input.fallbackBaseUrl)

  if (!(await deps.checkServer(baseUrl))) {
    throw new Error(`Cannot reach server at ${baseUrl}`)
  }

  const token = await deps.login(input.email, input.password, baseUrl)
  if (!token) {
    throw new Error('Login failed.')
  }

  const account = await deps.getAccountData(token, baseUrl)
  if (!account) {
    throw new Error('Failed to load account data after login.')
  }

  const webId = selectLinxAccountWebId(account, input.requestedWebId)
  if (!webId) {
    throw new Error('No WebID found. Pass --web-id explicitly.')
  }

  const hadMatchingStoredCredentials = hasMatchingLinxStoredCredentials(input.existingCredentials, baseUrl, webId)
  const existingCredentialsValid = hadMatchingStoredCredentials && input.existingCredentials?.authType === 'client_credentials'
    ? await deps.validateClientCredentials?.(input.existingCredentials)
    : false
  const reusedExistingCredentials = hadMatchingStoredCredentials
    && input.existingCredentials?.authType === 'client_credentials'
    && existingCredentialsValid === true

  const credentialStatus = resolveLinxCredentialBootstrapStatus({
    reusedExistingCredentials,
    hadMatchingStoredCredentials,
  })

  let credentialsToSave: PerformLinxPasswordLoginResult['credentialsToSave']

  if (!reusedExistingCredentials) {
    if (!account.controls.clientCredentials) {
      throw new Error('Cannot find client credentials endpoint.')
    }

    const credential = await deps.createClientCredentials(
      token,
      account.controls.clientCredentials,
      webId,
      input.credentialName ?? undefined,
    )

    if (!credential?.id || !credential.secret) {
      throw new Error('Failed to create local client credentials.')
    }

    credentialsToSave = {
      url: baseUrl,
      webId,
      authType: 'client_credentials',
      secrets: {
        clientId: credential.id,
        clientSecret: credential.secret,
      },
    }
  }

  return {
    baseUrl,
    webId,
    account,
    credentialStatus,
    ...(credentialsToSave ? { credentialsToSave } : {}),
    session: {
      url: baseUrl,
      email: input.email,
      token,
      webId,
      podUrl: resolveLinxPodUrl(webId),
      createdAt: (input.now ?? new Date()).toISOString(),
    },
  }
}
