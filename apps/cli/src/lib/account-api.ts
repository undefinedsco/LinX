import {
  parseLinxAccountData,
  parseLinxClientCredential,
  resolveLinxCloudAccountBaseUrl,
  type LinxAccountData,
  type LinxClientCredential,
} from '@linx/models/client'

export type AccountData = LinxAccountData
export type ClientCredential = LinxClientCredential

export function resolveAccountBaseUrl(url?: string): string {
  return resolveLinxCloudAccountBaseUrl(url || process.env.CSS_BASE_URL)
}

export async function checkServer(baseUrl?: string): Promise<boolean> {
  try {
    const res = await fetch(`${resolveAccountBaseUrl(baseUrl)}.account/`, {
      headers: { Accept: 'application/json' },
    })
    return res.ok
  } catch {
    return false
  }
}

export async function login(email: string, password: string, baseUrl?: string): Promise<string | null> {
  try {
    const res = await fetch(`${resolveAccountBaseUrl(baseUrl)}.account/login/password/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ email, password }),
    })

    if (!res.ok) {
      return null
    }

    const data = (await res.json()) as { authorization?: string }
    return data.authorization ?? null
  } catch {
    return null
  }
}

export async function getAccountData(token: string, baseUrl?: string): Promise<AccountData | null> {
  try {
    const res = await fetch(`${resolveAccountBaseUrl(baseUrl)}.account/`, {
      headers: {
        Accept: 'application/json',
        Authorization: `CSS-Account-Token ${token}`,
      },
    })

    if (!res.ok) {
      return null
    }

    return parseLinxAccountData(await res.json())
  } catch {
    return null
  }
}

export async function createClientCredentials(
  token: string,
  credentialsUrl: string,
  webId: string,
  name?: string,
): Promise<ClientCredential | null> {
  try {
    const res = await fetch(credentialsUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `CSS-Account-Token ${token}`,
      },
      body: JSON.stringify({
        name: name ?? `linx-cli-${Date.now()}`,
        webId,
      }),
    })

    if (!res.ok) {
      return null
    }

    return parseLinxClientCredential(await res.json())
  } catch {
    return null
  }
}

export async function listClientCredentials(token: string, baseUrl?: string): Promise<ClientCredential[]> {
  const account = await getAccountData(token, baseUrl)
  if (!account) {
    return []
  }

  return Object.entries(account.clientCredentials).map(([url, webId]) => ({
    id: url.split('/').filter(Boolean).pop() ?? url,
    webId: typeof webId === 'string' ? webId : undefined,
  }))
}

export async function revokeClientCredential(
  token: string,
  credentialId: string,
  baseUrl?: string,
): Promise<boolean> {
  try {
    const res = await fetch(`${resolveAccountBaseUrl(baseUrl)}.account/client-credentials/${credentialId}/`, {
      method: 'DELETE',
      headers: {
        Authorization: `CSS-Account-Token ${token}`,
      },
    })
    return res.ok
  } catch {
    return false
  }
}
