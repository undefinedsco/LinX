import type {
  NetworkAccessMode,
  ServiceSpaceKind,
  SetupConfig,
  TunnelProvider,
} from './types'

export type DomainSource = 'manual'

export interface SetupConfigResponse {
  dataDir?: string
  port?: number
  autoStart?: boolean
  spaceKind?: ServiceSpaceKind
  domainSource?: DomainSource
  publicDomain?: string
  autoDetectPublicIp?: boolean
  httpsCertPath?: string
  tunnelProvider?: TunnelProvider | ''
  hasTunnelToken?: boolean
}

export interface SetupDraft {
  dataDir: string
  port: number
  autoStart: boolean
  spaceKind: ServiceSpaceKind
  publicDomain: string
  autoDetectPublicIp: boolean
  httpsCertPath: string
  tunnelProvider: TunnelProvider | ''
  tunnelToken: string
  initialTunnelProvider: TunnelProvider | ''
  initialHasTunnelToken: boolean
}

export interface SetupPayload {
  dataDir: string
  port: number
  autoStart: boolean
  spaceKind: ServiceSpaceKind
  domainSource: DomainSource
  publicDomain?: string
  autoDetectPublicIp: boolean
  httpsCertPath?: string
  network: {
    accessMode: NetworkAccessMode
    tunnelProvider?: TunnelProvider
    tunnelToken?: string
  }
  local: { nodeId?: string; deviceId?: string }
  standalone: { customDomain?: string }
}

export interface SetupValidationError {
  message: string
  revealAdvanced: boolean
}

export function createSetupDraft(config: SetupConfigResponse = {}): SetupDraft {
  return {
    dataDir: config.dataDir ?? '',
    port: config.port ?? 5737,
    autoStart: config.autoStart ?? true,
    spaceKind: config.spaceKind ?? 'local',
    publicDomain: config.publicDomain ?? '',
    autoDetectPublicIp: config.autoDetectPublicIp ?? true,
    httpsCertPath: config.httpsCertPath ?? '',
    tunnelProvider: config.tunnelProvider ?? '',
    tunnelToken: '',
    initialTunnelProvider: config.tunnelProvider ?? '',
    initialHasTunnelToken: Boolean(config.hasTunnelToken),
  }
}

export function normalizeDomain(value: string): string {
  return value.trim().replace(/^https?:\/\//, '').replace(/\/+$/, '')
}

export function usesTunnel(draft: SetupDraft): boolean {
  return draft.spaceKind === 'local' && Boolean(draft.tunnelProvider)
}

export function validateSetupDraft(draft: SetupDraft): SetupValidationError | null {
  if (!draft.dataDir.trim()) return { message: '请填写数据目录', revealAdvanced: false }

  if (usesTunnel(draft)) {
    const canReuseToken = draft.initialHasTunnelToken
      && draft.initialTunnelProvider === draft.tunnelProvider
      && !draft.tunnelToken.trim()
    if (!canReuseToken && !draft.tunnelToken.trim()) {
      return { message: '请填写隧道密钥，或沿用已保存密钥', revealAdvanced: true }
    }
  }

  return null
}

export function buildSetupPayload(draft: SetupDraft): SetupPayload {
  const publicDomain = normalizeDomain(draft.publicDomain)
  const useTunnel = usesTunnel(draft)

  return {
    dataDir: draft.dataDir.trim(),
    port: draft.port,
    autoStart: draft.autoStart,
    spaceKind: draft.spaceKind,
    domainSource: 'manual',
    publicDomain: draft.spaceKind === 'local' && publicDomain ? publicDomain : undefined,
    autoDetectPublicIp: draft.autoDetectPublicIp,
    httpsCertPath: draft.spaceKind === 'standalone' ? draft.httpsCertPath.trim() || undefined : undefined,
    network: {
      accessMode: useTunnel ? 'tunnel' : 'auto',
      tunnelProvider: useTunnel ? draft.tunnelProvider || undefined : undefined,
      tunnelToken: useTunnel ? draft.tunnelToken.trim() || undefined : undefined,
    },
    local: {},
    standalone: {
      customDomain: draft.spaceKind === 'standalone' ? publicDomain || undefined : undefined,
    },
  }
}

export function buildCompleteSetupConfig(draft: SetupDraft): SetupConfig {
  const payload = buildSetupPayload(draft)
  return {
    edition: 'local',
    spaceKind: draft.spaceKind,
    pod: { port: draft.port, dataDir: payload.dataDir },
    local: payload.local,
    standalone: {
      customDomain: payload.standalone.customDomain,
      certPath: payload.httpsCertPath,
    },
    network: payload.network,
    autoStart: draft.autoStart,
  }
}
