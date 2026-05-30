type ManagedDomainConfig = {
  type: 'none' | 'managed' | 'custom';
  value?: string;
}

type LocalProviderSpaceKind = 'local' | 'standalone' | null

export function resolveManagedDomainFromEnv(env: Record<string, string>): {
  type: 'none' | 'managed' | 'custom';
  value?: string;
} {
  const baseUrl = env.CSS_BASE_URL;
  if (!baseUrl) {
    return { type: 'none' };
  }

  try {
    const { hostname, protocol } = new URL(baseUrl);
    if (protocol !== 'https:') {
      return { type: 'none' };
    }
    return normalizeManagedDomain({ type: resolveDomainType(hostname), value: hostname });
  } catch {
    return { type: 'none' };
  }
}

export function resolveEffectiveManagedDomain(options: {
  spaceKind: LocalProviderSpaceKind
  envDomain: ManagedDomainConfig
  existingDomain?: ManagedDomainConfig
}): ManagedDomainConfig {
  const envDomain = normalizeManagedDomain(options.envDomain)
  if (envDomain.type !== 'none' && envDomain.value?.trim()) {
    return envDomain
  }

  if (options.spaceKind === 'standalone') {
    return { type: 'none' }
  }

  return options.existingDomain
    ? normalizeManagedDomain(options.existingDomain)
    : { type: 'none' }
}

export function resolveManagedTunnelTokenFromEnv(
  env: Record<string, string>,
  spaceKind: LocalProviderSpaceKind,
): string | undefined {
  if (spaceKind === 'standalone') {
    return undefined;
  }

  const provider = env.LINX_TUNNEL_PROVIDER?.trim().toLowerCase();
  if (provider && provider !== 'cloudflare') {
    return undefined;
  }

  return env.CLOUDFLARE_TUNNEL_TOKEN?.trim() || undefined;
}

export function resolveEffectiveManagedTunnelToken(options: {
  env: Record<string, string>
  spaceKind: LocalProviderSpaceKind
  domain: ManagedDomainConfig
  existingTunnelToken?: string
}): string | undefined {
  if (options.spaceKind === 'standalone') {
    return undefined
  }

  return resolveManagedTunnelTokenFromEnv(options.env, options.spaceKind) ?? options.existingTunnelToken
}

function normalizeManagedDomain(domain: ManagedDomainConfig): ManagedDomainConfig {
  if (domain.type === 'none') {
    return { type: 'none' }
  }

  if (!domain.value?.trim()) {
    return { type: 'none' }
  }

  const value = domain.value.trim()
  if (domain.type === 'custom' && resolveDomainType(value) === 'managed') {
    return { type: 'managed', value }
  }

  return { type: domain.type, value }
}

function resolveDomainType(hostname: string): 'managed' | 'custom' {
  return /^node-[a-z0-9-]+\.undefineds\.co$/i.test(hostname)
    ? 'managed'
    : 'custom'
}
