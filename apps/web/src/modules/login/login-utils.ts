import { SESSION_SKIP_RESTORE_KEY } from './constants'

const DEFAULT_NATIVE_REDIRECT = 'linx://auth/callback'

const resolveSiteUrl = (): string | null => {
  const envSiteUrl = import.meta.env.VITE_SITE_URL
  console.log('🔍 Environment SITE_URL:', envSiteUrl)
  if (envSiteUrl && envSiteUrl.trim().length > 0) {
    return envSiteUrl.replace(/\/$/, '')
  }
  if (typeof window !== 'undefined') {
    const protocol = window.location.protocol
    if (protocol === 'http:' || protocol === 'https:') {
      const origin = window.location.origin.replace(/\/$/, '')
      console.log('🔍 Using browser origin:', origin)
      return origin
    }
  }
  console.log('🔍 No valid site URL found, returning null')
  return null
}

export const resolveRedirectUrl = (): string => {
  const siteUrl = resolveSiteUrl()
  if (siteUrl && typeof window !== 'undefined') {
    // 返回当前页面路径（不带 hash 和 query），让 OAuth callback 回到当前页
    // 这样每个页面都能接收 callback，刷新时不会跳转到 /auth/callback
    const currentPath = window.location.pathname
    // 排除已经在 callback 页面的情况
    if (currentPath.startsWith('/auth/callback')) {
      return `${siteUrl}/auth/callback`
    }
    return `${siteUrl}${currentPath}`
  }
  if (siteUrl) {
    return `${siteUrl}/auth/callback`
  }
  return DEFAULT_NATIVE_REDIRECT
}

export const ensureRedirectAllowed = (redirectUrl: string) => {
  const parsed = new URL(redirectUrl)
  if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
    return redirectUrl
  }
  if (parsed.protocol === 'linx:') {
    return redirectUrl
  }
  throw new Error(`Unsupported redirect protocol: ${parsed.protocol}`)
}

/**
 * 检查是否有有效的存储会话
 * 不仅检查数据是否存在，还验证关键字段是否完整
 */
export const hasStoredSolidSession = (_storageKey?: string) => {
  if (typeof window === 'undefined') return false

  const keys = Object.keys(localStorage)
  for (const key of keys) {
    if (key.startsWith('solidClientAuthenticationUser:')) {
      const value = localStorage.getItem(key)
      if (!value || value === '{}') continue

      try {
        const parsed = JSON.parse(value)
        // 验证关键字段：必须有 issuer 和 refreshToken 或 accessToken
        const hasIssuer = Boolean(parsed.issuer)
        const hasToken = Boolean(parsed.refreshToken || parsed.accessToken)

        if (hasIssuer && hasToken) {
          console.log('🔍 Found valid stored session:', { key, issuer: parsed.issuer })
          return true
        } else {
          // 数据不完整，清理掉
          console.log('🧹 Removing invalid session data:', { key, hasIssuer, hasToken })
          localStorage.removeItem(key)
        }
      } catch (e) {
        // JSON 解析失败，清理掉
        console.log('🧹 Removing corrupted session data:', key)
        localStorage.removeItem(key)
      }
    }
  }

  console.log('🔍 No valid stored session found')
  return false
}

export const clearStoredSolidSession = (_storageKey?: string) => {
  if (typeof window === 'undefined') return
  // Clear all solidClientAuthenticationUser:* keys
  const keys = Object.keys(localStorage)
  for (const key of keys) {
    if (key.startsWith('solidClientAuthenticationUser:') || key.startsWith('oidc.')) {
      localStorage.removeItem(key)
      console.log('🧹 Cleared stored Solid session key:', key)
    }
  }
}

export const shouldSkipAutoRestore = () => {
  if (typeof window === 'undefined') return false
  return localStorage.getItem(SESSION_SKIP_RESTORE_KEY) === 'true'
}

export const setSkipAutoRestore = (value: boolean) => {
  if (typeof window === 'undefined') return
  if (value) {
    localStorage.setItem(SESSION_SKIP_RESTORE_KEY, 'true')
  } else {
    localStorage.removeItem(SESSION_SKIP_RESTORE_KEY)
  }
}

const REDIRECT_PATH_KEY = 'linx:redirect_path'

export const saveRedirectPath = (path: string) => {
  if (typeof window === 'undefined') return
  if (path.startsWith('/auth/callback')) return
  sessionStorage.setItem(REDIRECT_PATH_KEY, path)
}

export const getRedirectPath = (defaultPath: string = '/'): string => {
  if (typeof window === 'undefined') return defaultPath
  const path = sessionStorage.getItem(REDIRECT_PATH_KEY)
  sessionStorage.removeItem(REDIRECT_PATH_KEY)
  return path || defaultPath
}
