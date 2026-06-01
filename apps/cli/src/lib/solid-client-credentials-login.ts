import { saveAccountSession } from './account-session.js'
import { clearCredentials, loadCredentials, saveCredentials, type StoredConfig, type StoredSecrets } from './credentials-store.js'
import { createPodDataSession, type PodDataSession } from './pod-data-session.js'
import { resolveAccountBaseUrl } from './account-api.js'

export interface SolidClientCredentials {
  clientId: string
  clientSecret: string
}

export interface SolidClientCredentialsLoginRuntime {
  loadCredentials: typeof loadCredentials
  saveCredentials: typeof saveCredentials
  clearCredentials: typeof clearCredentials
  saveAccountSession: typeof saveAccountSession
  createPodDataSession: typeof createPodDataSession
  resolveAccountBaseUrl: typeof resolveAccountBaseUrl
}

export interface SolidClientCredentialsLoginResult {
  credentials: StoredConfig & { secrets: StoredSecrets }
  webId: string
  podUrl: string
}

export const defaultSolidClientCredentialsLoginRuntime: SolidClientCredentialsLoginRuntime = {
  loadCredentials,
  saveCredentials,
  clearCredentials,
  saveAccountSession,
  createPodDataSession,
  resolveAccountBaseUrl,
}

export function parseSolidClientCredentials(value: string): SolidClientCredentials | null {
  const trimmed = value.trim()
  if (!trimmed) {
    return null
  }

  const directCredentials = parseDirectSolidClientCredentials(trimmed)
  if (directCredentials) {
    return directCredentials
  }

  return null
}

function parseDirectSolidClientCredentials(value: string): SolidClientCredentials | null {
  const separator = value.indexOf(':')
  if (separator <= 0 || separator === value.length - 1) {
    return null
  }

  const clientId = value.slice(0, separator).trim()
  const clientSecret = value.slice(separator + 1).trim()
  if (!clientId || !clientSecret) {
    return null
  }

  return { clientId, clientSecret }
}

export async function persistSolidClientCredentialsLogin(
  credentialsText: string,
  runtime: Partial<SolidClientCredentialsLoginRuntime> = {},
): Promise<SolidClientCredentialsLoginResult> {
  const resolvedRuntime: SolidClientCredentialsLoginRuntime = {
    ...defaultSolidClientCredentialsLoginRuntime,
    ...runtime,
  }
  const parsed = parseSolidClientCredentials(credentialsText)
  if (!parsed) {
    throw new Error('Invalid Solid client credentials. Expected client_id:client_secret.')
  }

  const previousCredentials = resolvedRuntime.loadCredentials()
  const url = previousCredentials?.url ?? resolvedRuntime.resolveAccountBaseUrl()
  const provisionalCredentials = {
    url,
    webId: previousCredentials?.webId ?? '',
    authType: 'client_credentials' as const,
    secrets: {
      clientId: parsed.clientId,
      clientSecret: parsed.clientSecret,
    },
  }

  resolvedRuntime.saveCredentials(provisionalCredentials)

  let validatedSession: PodDataSession | null = null
  try {
    validatedSession = await resolvedRuntime.createPodDataSession()
    if (!validatedSession) {
      throw new Error('Solid client credentials did not produce a Pod session.')
    }

    const credentials = {
      url,
      webId: validatedSession.webId,
      authType: 'client_credentials' as const,
      secrets: {
        clientId: parsed.clientId,
        clientSecret: parsed.clientSecret,
      },
    }
    resolvedRuntime.saveCredentials(credentials)
    resolvedRuntime.saveAccountSession({
      url,
      email: 'client-credentials',
      token: 'client-credentials',
      webId: validatedSession.webId,
      podUrl: validatedSession.podUrl,
      createdAt: new Date().toISOString(),
    })

    return {
      credentials,
      webId: validatedSession.webId,
      podUrl: validatedSession.podUrl,
    }
  } catch (error) {
    if (previousCredentials) {
      resolvedRuntime.saveCredentials(previousCredentials)
    } else {
      resolvedRuntime.clearCredentials()
    }
    throw error
  } finally {
    await validatedSession?.close().catch(() => undefined)
  }
}
