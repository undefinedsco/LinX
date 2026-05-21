type ManagedDomainConfig = {
  type: 'none' | 'custom';
  value?: string;
}

type LocalProviderMode = 'device-only' | 'remote-ready' | null

export function resolveManagedDomainFromEnv(env: Record<string, string>): {
  type: 'none' | 'custom';
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
    return { type: 'custom', value: hostname };
  } catch {
    return { type: 'none' };
  }
}

export function resolveEffectiveManagedDomain(options: {
  mode: LocalProviderMode
  envDomain: ManagedDomainConfig
  existingDomain?: ManagedDomainConfig
}): ManagedDomainConfig {
  if (options.envDomain.type === 'custom' && options.envDomain.value?.trim()) {
    return options.envDomain
  }

  if (options.mode === 'device-only') {
    return { type: 'none' }
  }

  return options.existingDomain ?? { type: 'none' }
}

export function resolveManagedTunnelTokenFromEnv(
  env: Record<string, string>,
  mode: LocalProviderMode,
): string | undefined {
  if (mode === 'device-only') {
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
  mode: LocalProviderMode
  domain: ManagedDomainConfig
  existingTunnelToken?: string
}): string | undefined {
  const effectiveMode = options.domain.type === 'custom' ? 'remote-ready' : options.mode
  if (effectiveMode === 'device-only') {
    return undefined
  }

  return resolveManagedTunnelTokenFromEnv(options.env, effectiveMode) ?? options.existingTunnelToken
}
