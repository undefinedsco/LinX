/**
 * pods.undefineds.co 子域名管理 API 客户端
 *
 * 目前使用 mock 实现，等服务端好了再对接真实 API
 */

import { LINX_CLOUD_API_ORIGIN } from '@linx/models/client'

const API_BASE = LINX_CLOUD_API_ORIGIN

export interface SubdomainCheckResult {
  available: boolean
  subdomain: string
  fqdn: string
  reason?: string
}

export interface SubdomainClaimResult {
  subdomain: string
  fqdn: string
  tunnelToken: string
  ownerWebId: string
}

export interface SubdomainRecord {
  subdomain: string
  fqdn: string
  status: 'active' | 'suspended'
  createdAt: string
  lastActiveAt: string
}

// 是否使用 mock
const USE_MOCK = true

/**
 * 检查子域名可用性
 */
export async function checkSubdomain(name: string): Promise<SubdomainCheckResult> {
  if (USE_MOCK) {
    await new Promise(r => setTimeout(r, 300 + Math.random() * 200))

    // Mock: 格式校验
    if (!/^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$/.test(name)) {
      return {
        available: false,
        subdomain: name,
        fqdn: `${name}.pods.undefineds.co`,
        reason: 'invalid-format',
      }
    }

    // Mock: 保留名称
    const reserved = ['www', 'api', 'admin', 'mail', 'app', 'test', 'demo']
    if (reserved.includes(name)) {
      return {
        available: false,
        subdomain: name,
        fqdn: `${name}.pods.undefineds.co`,
        reason: 'reserved',
      }
    }

    // Mock: 随机已占用（10% 概率）
    if (Math.random() < 0.1) {
      return {
        available: false,
        subdomain: name,
        fqdn: `${name}.pods.undefineds.co`,
        reason: 'already-taken',
      }
    }

    return {
      available: true,
      subdomain: name,
      fqdn: `${name}.pods.undefineds.co`,
    }
  }

  const response = await fetch(`${API_BASE}/api/subdomains/check?name=${encodeURIComponent(name)}`)
  if (!response.ok) {
    throw new Error('Failed to check subdomain')
  }
  return response.json()
}

/**
 * 申请子域名
 * 需要 Solid OIDC Token
 */
export async function claimSubdomain(
  name: string,
  accessToken: string,
  dpopProof: string
): Promise<SubdomainClaimResult> {
  if (USE_MOCK) {
    await new Promise(r => setTimeout(r, 500 + Math.random() * 500))

    // Mock: 返回假的 tunnel token
    return {
      subdomain: name,
      fqdn: `${name}.pods.undefineds.co`,
      tunnelToken: `mock-tunnel-token-${Date.now()}`,
      ownerWebId: 'https://mock.pods.undefineds.co/profile/card#me',
    }
  }

  const response = await fetch(`${API_BASE}/api/subdomains/claim`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `DPoP ${accessToken}`,
      'DPoP': dpopProof,
    },
    body: JSON.stringify({ subdomain: name }),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.message || 'Failed to claim subdomain')
  }

  return response.json()
}

/**
 * 获取我的子域名列表
 * 需要 Solid OIDC Token
 */
export async function listMySubdomains(
  accessToken: string,
  dpopProof: string
): Promise<{ subdomains: SubdomainRecord[] }> {
  if (USE_MOCK) {
    await new Promise(r => setTimeout(r, 200))
    return { subdomains: [] }
  }

  const response = await fetch(`${API_BASE}/api/subdomains/mine`, {
    headers: {
      'Authorization': `DPoP ${accessToken}`,
      'DPoP': dpopProof,
    },
  })

  if (!response.ok) {
    throw new Error('Failed to list subdomains')
  }

  return response.json()
}

/**
 * 删除子域名
 * 需要 Solid OIDC Token
 */
export async function deleteSubdomain(
  name: string,
  accessToken: string,
  dpopProof: string
): Promise<void> {
  if (USE_MOCK) {
    await new Promise(r => setTimeout(r, 300))
    return
  }

  const response = await fetch(`${API_BASE}/api/subdomains/${encodeURIComponent(name)}`, {
    method: 'DELETE',
    headers: {
      'Authorization': `DPoP ${accessToken}`,
      'DPoP': dpopProof,
    },
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.message || 'Failed to delete subdomain')
  }
}

/**
 * 刷新隧道 Token
 * 需要 Solid OIDC Token
 */
export async function refreshTunnelToken(
  name: string,
  accessToken: string,
  dpopProof: string
): Promise<{ tunnelToken: string }> {
  if (USE_MOCK) {
    await new Promise(r => setTimeout(r, 300))
    return { tunnelToken: `mock-tunnel-token-refreshed-${Date.now()}` }
  }

  const response = await fetch(`${API_BASE}/api/subdomains/${encodeURIComponent(name)}/refresh-token`, {
    method: 'POST',
    headers: {
      'Authorization': `DPoP ${accessToken}`,
      'DPoP': dpopProof,
    },
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.message || 'Failed to refresh tunnel token')
  }

  return response.json()
}
