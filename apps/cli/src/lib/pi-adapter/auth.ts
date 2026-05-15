import {
  getClientCredentialId,
  getClientCredentialKey,
  getClientCredentials,
  loadCredentials,
  type StoredCredentials,
} from '../credentials-store.js'
import { getOidcAccessToken, isOidcLoginExpiredError } from '../oidc-auth.js'
import { getAccessToken } from '../solid-auth.js'
import type { OAuthCredentials } from '@mariozechner/pi-ai'

export interface PiCloudOAuthCredential extends OAuthCredentials {
  type: 'oauth'
}

export interface PiAuthBridgeRuntime {
  loadCredentials: typeof loadCredentials
  getClientCredentials: typeof getClientCredentials
  getAccessToken: typeof getAccessToken
  getOidcAccessToken: typeof getOidcAccessToken
}

type ResolveLinxPiCloudOAuthOptions = {
  forceRefresh?: boolean
}

function isRuntimeOverride(value: unknown): value is Partial<PiAuthBridgeRuntime> {
  return typeof value === 'object'
    && value !== null
    && (
      'loadCredentials' in value
      || 'getClientCredentials' in value
      || 'getAccessToken' in value
      || 'getOidcAccessToken' in value
    )
}

function resolveOidcExpiresAt(credentials: Pick<StoredCredentials, 'secrets'>): number {
  const expiresAt = 'oidcExpiresAt' in credentials.secrets
    ? new Date(credentials.secrets.oidcExpiresAt).getTime()
    : NaN
  return Number.isFinite(expiresAt) ? expiresAt : Date.now()
}

export async function resolveLinxPiCloudOAuthCredential(
  issuerUrl?: string,
  runtime?: Partial<PiAuthBridgeRuntime>,
): Promise<PiCloudOAuthCredential | null>
export async function resolveLinxPiCloudOAuthCredential(
  issuerUrl?: string,
  options?: ResolveLinxPiCloudOAuthOptions,
  runtime?: Partial<PiAuthBridgeRuntime>,
): Promise<PiCloudOAuthCredential | null>
export async function resolveLinxPiCloudOAuthCredential(
  issuerUrl?: string,
  optionsOrRuntime: ResolveLinxPiCloudOAuthOptions | Partial<PiAuthBridgeRuntime> = {},
  runtimeArg?: Partial<PiAuthBridgeRuntime>,
): Promise<PiCloudOAuthCredential | null> {
  const defaultRuntime: PiAuthBridgeRuntime = {
    loadCredentials,
    getClientCredentials,
    getAccessToken,
    getOidcAccessToken,
  }
  const options = isRuntimeOverride(optionsOrRuntime)
    ? {}
    : optionsOrRuntime
  const runtime: PiAuthBridgeRuntime = {
    ...defaultRuntime,
    ...(isRuntimeOverride(optionsOrRuntime) ? optionsOrRuntime : runtimeArg),
  }

  const stored = runtime.loadCredentials()
  if (!stored) {
    return null
  }

  const clientCredentials = runtime.getClientCredentials(stored)
  if (!clientCredentials) {
    const oidcAccessToken = await runtime.getOidcAccessToken(stored, { forceRefresh: options.forceRefresh }).catch((error) => {
      if (isOidcLoginExpiredError(error)) {
        throw error
      }
      return null
    })
    if (!oidcAccessToken) {
      return null
    }

    return {
      type: 'oauth',
      refresh: 'linx-oidc-refresh',
      access: oidcAccessToken,
      expires: resolveOidcExpiresAt(stored),
    }
  }

  const resolvedIssuerUrl = issuerUrl?.trim() || stored.url
  const clientId = getClientCredentialId(clientCredentials)
  const clientSecret = getClientCredentialKey(clientCredentials)
  const token = await runtime.getAccessToken(clientId, clientSecret, resolvedIssuerUrl)
  if (!token) {
    return null
  }

  return {
    type: 'oauth',
    refresh: clientSecret,
    access: token.accessToken,
    expires: token.expiresAt.getTime(),
  }
}
