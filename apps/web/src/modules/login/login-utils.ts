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

export const hasStoredSolidSession = (storageKey: string) => {
  if (typeof window === 'undefined') return false
  const hasSession = Boolean(localStorage.getItem(storageKey))
  console.log('🔍 Checking for stored session:', { storageKey, hasSession })
  return hasSession
}

export const clearStoredSolidSession = (storageKey: string) => {
  if (typeof window === 'undefined') return
  localStorage.removeItem(storageKey)
  console.log('🧹 Cleared stored Solid session flag:', storageKey)
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
