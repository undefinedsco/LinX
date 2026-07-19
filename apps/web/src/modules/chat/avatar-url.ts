import { getAgentProviderInfo } from '@/lib/agent-providers'

const KNOWN_PROVIDER_LOGO_HOSTS = new Set([
  'openai.com',
  'www.anthropic.com',
  'console.anthropic.com',
  'cdn.jsdelivr.net',
  'ai.google.dev',
  'x.ai',
  'www.deepseek.com',
  'openrouter.ai',
  'undefineds.co',
])

function isKnownProviderLogoUrl(value: string): boolean {
  try {
    const url = new URL(value)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return false
    if (!KNOWN_PROVIDER_LOGO_HOSTS.has(url.hostname)) return false
    return /favicon|simple-icons|anthropic\.svg/i.test(url.pathname)
  } catch {
    return false
  }
}

export function resolveSafeChatAvatarUrl(value?: string | null, providerId?: string | null): string | undefined {
  const providerLogo = providerId ? getAgentProviderInfo(providerId)?.logoUrl : undefined
  const raw = typeof value === 'string' ? value.trim() : ''
  if (!raw) return providerLogo
  if (isKnownProviderLogoUrl(raw)) return providerLogo
  return raw
}
