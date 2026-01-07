import type { CustomIssuerDraft, SolidIssuerOption, StoredIssuer } from './types'
import { LINQ_OFFICIAL_ISSUER, LOCAL_DEV_ISSUER } from './constants'

const getDomain = (url: string): string => {
  try {
    const parsed = new URL(url)
    return parsed.hostname
  } catch {
    return url.replace(/^https?:\/\//, '')
  }
}

export const normalizeIssuerUrl = (url: string): string => {
  try {
    const parsed = new URL(url.trim())
    parsed.pathname = parsed.pathname.replace(/\/+$|$/, '/').replace(/\/+$/, '/')
    const normalized = `${parsed.protocol}//${parsed.host}${parsed.pathname === '/' ? '' : parsed.pathname}`
    return normalized.replace(/\/+$/, '')
  } catch {
    return url.trim().replace(/\/+$/, '')
  }
}

const buildIssuerLogo = (domain: string): string => `https://icons.duckduckgo.com/ip3/${domain}.ico`
export const getIssuerLogoUrl = (domain: string | undefined): string | undefined =>
  domain ? buildIssuerLogo(domain) : undefined

export const getProviderAlias = (domain: string | undefined): string | undefined => {
  if (!domain) return undefined
  const parts = domain.split('.').filter(Boolean)
  if (parts.length >= 2) return parts[parts.length - 2]
  return parts[0]
}

const buildOption = (url: string, opts?: Partial<SolidIssuerOption>): SolidIssuerOption => {
  const domain = getDomain(url)
  const alias = opts?.label ?? getProviderAlias(domain) ?? domain
  return {
    id: url,
    url,
    label: alias,
    domain,
    description: opts?.description,
    isDefault: opts?.isDefault,
    isRecent: opts?.isRecent,
    logoUrl: opts?.logoUrl ?? buildIssuerLogo(domain),
    isCustom: opts?.isCustom ?? false,
  }
}

export const buildDefaultIssuers = (): SolidIssuerOption[] => [
  buildOption(normalizeIssuerUrl(LINQ_OFFICIAL_ISSUER), {
    description: getDomain(LINQ_OFFICIAL_ISSUER),
    isDefault: true,
    logoUrl: 'https://linx.ai/favicon.ico',
  }),
  buildOption(normalizeIssuerUrl(LOCAL_DEV_ISSUER), {
    description: getDomain(LOCAL_DEV_ISSUER),
    isDefault: true,
    logoUrl: buildIssuerLogo(getDomain(LOCAL_DEV_ISSUER)),
  }),
]

export const mergeStoredIssuers = (stored: StoredIssuer[]): SolidIssuerOption[] => {
  return stored.map((item) =>
    buildOption(normalizeIssuerUrl(item.url), {
      label: item.label ?? getProviderAlias(getDomain(item.url)) ?? getDomain(item.url),
      isRecent: true,
      logoUrl: item.logoUrl,
      isCustom: true,
    })
  )
}

export const combineIssuerOptions = (stored: StoredIssuer[]): SolidIssuerOption[] => {
  const defaults = buildDefaultIssuers()
  const custom = mergeStoredIssuers(stored)
  const map = new Map<string, SolidIssuerOption>()

  const upsert = (option: SolidIssuerOption) => {
    const key = normalizeIssuerUrl(option.url)
    const existing = map.get(key)
    if (existing) {
      existing.isRecent = existing.isRecent || option.isRecent
      existing.label = existing.label || option.label
      existing.description = existing.description || option.description
    } else {
      map.set(key, { ...option, url: key })
    }
  }

  defaults.forEach(upsert)
  custom.forEach(upsert)

  return Array.from(map.values())
}

export const extractDomain = getDomain

export const validateIssuer = (value: string): boolean => {
  if (!value) return false
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

export const buildCustomDraft = (value = ''): CustomIssuerDraft => ({
  value,
  isValid: validateIssuer(value),
  error: value.length === 0 || validateIssuer(value) ? undefined : '请输入合法的 URL',
})
