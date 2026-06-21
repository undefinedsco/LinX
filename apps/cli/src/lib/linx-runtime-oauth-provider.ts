import type { OAuthCredentials } from '@earendil-works/pi-ai'
import type { RemoteAuthFetch } from './chat-api.js'
import { ensureBrowserConsentLogin } from './oidc-auth.js'
import { clearDefaultPodDataSession, type PodDataSession } from './pod-data-session.js'
import { resolveLinxCloudRuntimeAuthFetch } from './linx-cloud-runtime-auth.js'
import { LINX_RUNTIME_MANAGED_AUTH_KEY } from './linx-runtime-auth.js'

type LinxRuntimeOAuthCallbacks = {
  onAuth(info: { url: string; instructions?: string }): void
  onProgress?(message: string): void
  onManualCodeInput?: (signal?: AbortSignal) => Promise<string>
  forceFresh?: boolean
  signal?: AbortSignal
}

export type LinxManagedRuntimeOAuthProvider = {
  name: 'LinX Cloud'
  usesCallbackServer: true
  login(callbacks: LinxRuntimeOAuthCallbacks): Promise<OAuthCredentials>
  refreshToken(credentials: OAuthCredentials): Promise<OAuthCredentials>
  getApiKey(credentials: OAuthCredentials): string
}

export function createLinxManagedRuntimeOAuthProvider(options: {
  issuerUrl?: string
  getPodDataSession?: () => Promise<PodDataSession | null>
  syncProviderModels: (authSession: { runtimeFetch: RemoteAuthFetch }) => Promise<void>
}): LinxManagedRuntimeOAuthProvider {
  return {
    name: 'LinX Cloud',
    usesCallbackServer: true,
    async login(callbacks) {
      callbacks.onProgress?.('Opening LinX Cloud login in your browser...')
      const result = await ensureBrowserConsentLogin({
        issuerUrl: options.issuerUrl,
        forceFresh: callbacks.forceFresh,
        signal: callbacks.signal,
        onAuthUrl(url) {
          callbacks.onAuth({
            url,
            instructions: 'Complete LinX Cloud consent in your browser. If the local callback is blocked, paste the final redirect URL below.',
          })
        },
        manualRedirectUrl: callbacks.onManualCodeInput,
      })
      clearDefaultPodDataSession()
      if (result.reusedExistingSession) {
        callbacks.onProgress?.('Reused existing LinX Cloud session.')
      }
      const authFetch = await resolveLinxCloudRuntimeAuthFetch({
        issuerUrl: options.issuerUrl,
        getPodDataSession: options.getPodDataSession,
      })
      await options.syncProviderModels({ runtimeFetch: authFetch })

      return {
        refresh: result.tokenSet.refreshToken ?? '',
        access: LINX_RUNTIME_MANAGED_AUTH_KEY,
        expires: result.tokenSet.expiresAt ? result.tokenSet.expiresAt * 1000 : Date.now() + 60 * 60 * 1000,
      }
    },
    async refreshToken(credentials) {
      clearDefaultPodDataSession()
      const authFetch = await resolveLinxCloudRuntimeAuthFetch({
        issuerUrl: options.issuerUrl,
        getPodDataSession: options.getPodDataSession,
      })
      await options.syncProviderModels({ runtimeFetch: authFetch })
      return {
        type: 'oauth',
        refresh: credentials.refresh,
        access: LINX_RUNTIME_MANAGED_AUTH_KEY,
        expires: Date.now() + 60 * 60 * 1000,
      }
    },
    getApiKey() {
      return LINX_RUNTIME_MANAGED_AUTH_KEY
    },
  }
}
