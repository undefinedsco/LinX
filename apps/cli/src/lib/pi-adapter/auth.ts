import { getClientCredentials, loadCredentials } from '../credentials-store.js'
import { getOidcAccessToken } from '../oidc-auth.js'
import { getAccessToken } from '../solid-auth.js'
import type { OAuthCredentials } from '@mariozechner/pi-ai'

export interface PiCloudOAuthCredential extends OAuthCredentials {
  type: 'oauth'
}

export interface PiAuthBridgeRuntime {
  loadCredentials: typeof loadCredentials
  getClientCredentials: typeof getClientCredentials
  getAccessToken: typeof getAccessToken
}

export async function resolveLinxPiCloudOAuthCredential(
  issuerUrl?: string,
  runtime: PiAuthBridgeRuntime = {
    loadCredentials,
    getClientCredentials,
    getAccessToken,
  },
): Promise<PiCloudOAuthCredential | null> {
  const stored = runtime.loadCredentials()
  if (!stored) {
    return null
  }

  const clientCredentials = runtime.getClientCredentials(stored)
  if (!clientCredentials) {
    const oidcAccessToken = await getOidcAccessToken(stored).catch(() => null)
    if (!oidcAccessToken) {
      return null
    }

    return {
      type: 'oauth',
      refresh: 'linx-oidc-refresh',
      access: oidcAccessToken,
      expires: Date.now() + 60 * 60 * 1000,
    }
  }

  const resolvedIssuerUrl = issuerUrl?.trim() || stored.url
  const token = await runtime.getAccessToken(clientCredentials.clientId, clientCredentials.clientSecret, resolvedIssuerUrl)
  if (!token) {
    return null
  }

  return {
    type: 'oauth',
    refresh: clientCredentials.clientSecret,
    access: token.accessToken,
    expires: token.expiresAt.getTime(),
  }
}
