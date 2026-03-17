import { resolveLinxRuntimeOriginForIssuerUrl } from '@linx/models/client'

export interface RuntimeTargetOptions {
  issuerUrl: string
  runtimeUrlOverride?: string | null
}

export interface RuntimeTarget {
  oidcIssuer: string
  runtimeUrl: string
}

export function resolveRuntimeTarget(options: RuntimeTargetOptions): RuntimeTarget {
  const oidcIssuer = options.issuerUrl
  const runtimeUrl = typeof options.runtimeUrlOverride === 'string' && options.runtimeUrlOverride.trim()
    ? options.runtimeUrlOverride.trim()
    : resolveLinxRuntimeOriginForIssuerUrl(oidcIssuer)

  return {
    oidcIssuer,
    runtimeUrl,
  }
}
