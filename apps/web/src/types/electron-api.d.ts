export interface ServiceState {
  name: string
  status: 'running' | 'stopped' | 'starting' | 'crashed'
  pid?: number
  startTime?: number
  uptime?: number
  restartCount?: number
  lastExitCode?: number
}

export interface ManagedPodConfig {
  status: 'stopped' | 'starting' | 'running' | 'error'
  dataDir: string
  port: number
  spaceKind?: 'local' | 'standalone' | null
  domain: {
    type: 'none' | 'managed' | 'custom'
    value?: string
  }
  tunnelToken?: string
}

export interface SolidProvider {
  id: string
  name: string
  issuerUrl: string
  isDefault?: boolean
  managed?: ManagedPodConfig
}

export interface XpodStartOptions {
  providerId: string
  dataDir: string
  port: number
  spaceKind: 'local' | 'standalone'
  domain?: {
    type: 'none' | 'managed' | 'custom'
    value?: string
  }
  tunnelToken?: string
}

export interface XpodStatus {
  running: boolean
  status?: 'starting' | 'running' | 'stopped' | 'error'
  providerId?: string
  port?: number
  baseUrl?: string
  localUrl?: string
  pid?: number
  provisioning?: XpodProvisioningInfo
  runtime?: XpodRuntimeInfo
}

export interface XpodRuntimeInfo {
  launchKind?: string | null
  currentVersion?: string | null
  targetVersion?: string | null
  upgradeAvailable: boolean
}

export interface XpodProvisioningInfo {
  nodeId: string
  publicUrl: string
  provisionCode: string
  provisionUrl: string
  spDomain?: string
  cloudIdentityUrl: string
  cloudApiUrl: string
  registeredAt: number
}

export interface AppUpdateStatus {
  currentVersion: string
  latestVersion: string | null
  releaseUrl: string | null
  checkedAt: string | null
  available: boolean
  source: 'github-release' | 'custom-feed'
  error: string | null
}

export type LocalSpaceKind = 'local' | 'standalone'

export type LocalOnboardingState =
  | 'space_required'
  | 'idle'
  | 'checking'
  | 'starting'
  | 'repair_required'
  | 'ready'
  | 'error'

export interface LocalOnboardingCapabilities {
  supported: boolean
  contract: string | null
  baseUrl: string | null
  version: string | null
}

export interface LocalOnboardingProgress {
  phase: string
  label: string
  detail?: string | null
}

export type LocalOnboardingRouteKind = 'local' | 'public'

export interface LocalOnboardingRouteProbe {
  kind: LocalOnboardingRouteKind
  url: string | null
  reachable: boolean
  sameNode: boolean | null
  latencyMs: number | null
  baseUrl: string | null
  message: string | null
}

export interface LocalOnboardingConnectivity {
  status: 'unknown' | 'checking' | 'ready' | 'local-only' | 'failed' | 'mismatch'
  checkedAt: number | null
  local: LocalOnboardingRouteProbe | null
  public: LocalOnboardingRouteProbe | null
  message: string | null
}

export interface LocalOnboardingTunnel {
  provider: 'cloudflare' | null
  hasToken: boolean
  endpoint: string | null
}

export interface LocalOnboardingNetworkConfigInput {
  publicDomain?: string | null
  tunnelProvider?: 'cloudflare' | null
  tunnelToken?: string | null
}

export interface LocalOnboardingSnapshot {
  state: LocalOnboardingState
  spaceKind: LocalSpaceKind | null
  localUrl: string | null
  baseUrl: string | null
  publicUrl: string | null
  tunnel: LocalOnboardingTunnel | null
  connectivity: LocalOnboardingConnectivity | null
  capabilities: LocalOnboardingCapabilities | null
  cloudIdentityUrl: string | null
  provisionCode: string | null
  provisionUrl: string | null
  nodeId: string | null
  message: string | null
  progress?: LocalOnboardingProgress | null
  errorCode: string | null
  canRetry: boolean
  canOpenSettings: boolean
}

export interface ProviderAPI {
  list: () => Promise<SolidProvider[]>
  get: (id: string) => Promise<SolidProvider | undefined>
  getDefault: () => Promise<SolidProvider | undefined>
  add: (provider: SolidProvider) => Promise<{ success: boolean }>
  update: (id: string, updates: Partial<SolidProvider>) => Promise<{ success: boolean }>
  remove: (id: string) => Promise<{ success: boolean }>
  setDefault: (id: string) => Promise<{ success: boolean }>
  detect: (url: string) => Promise<{
    success: boolean
    issuer?: string
    name?: string
    error?: string
  }>
}

export interface XpodAPI {
  start: (options: XpodStartOptions) => Promise<{ success: boolean }>
  stop: () => Promise<{ success: boolean }>
  restart: () => Promise<{ success: boolean }>
  upgrade: () => Promise<{ success: boolean }>
  status: () => Promise<XpodStatus>
  healthCheck: () => Promise<boolean>
}

export interface SupervisorAPI {
  getStatus: () => Promise<ServiceState[]>
  onStatusChange: (callback: (data: { name: string; state: ServiceState }) => void) => void
}

export interface ConfigAPI {
  getAll: () => Promise<Record<string, string>>
  getSchema: () => Promise<any>
  getPath: () => Promise<string>
  update: (updates: Record<string, string>) => Promise<{ success: boolean }>
  reset: () => Promise<{ success: boolean }>
}

export interface DialogAPI {
  selectDirectory: () => Promise<string | null>
}

export interface AppAPI {
  getVersion: () => Promise<string>
  getConfigWindowState: () => Promise<{ open: boolean; reason: 'opened' | 'closed'; ready: boolean }>
  getUpdateStatus: (force?: boolean) => Promise<AppUpdateStatus>
  openExternal: (url: string) => Promise<void>
  openConfigWindow: () => Promise<{ success: boolean }>
  closeConfigWindow: () => Promise<{ success: boolean }>
  onConfigWindowState: (
    callback: (state: { open: boolean; reason: 'opened' | 'closed'; ready: boolean }) => void,
  ) => () => void
}

export interface AuthAPI {
  prepareLoopbackRedirect: () => Promise<string>
  resolveOidcIssuer?: (url: string) => Promise<string | null>
  getEmbeddedAuthorizationState: () => Promise<{ open: boolean; reason: 'opened' | 'completed' | 'dismissed'; ready: boolean }>
  openAuthorizationWindow: (url: string, options?: { providerLabel?: string }) => Promise<void>
  openEmbeddedAuthorization: (url: string, options?: { providerLabel?: string }) => Promise<void>
  closeEmbeddedAuthorization: () => Promise<void>
  consumePendingRedirect: () => Promise<string | null>
  onAuthorizationWindowState: (
    callback: (state: { open: boolean; reason: 'opened' | 'completed' | 'dismissed' }) => void,
  ) => () => void
  onEmbeddedAuthorizationState: (
    callback: (state: { open: boolean; reason: 'opened' | 'completed' | 'dismissed'; ready: boolean }) => void,
  ) => () => void
  onRedirect: (callback: () => void) => () => void
}

export interface LocalOnboardingAPI {
  getSnapshot: () => Promise<LocalOnboardingSnapshot>
  chooseSpace: (spaceKind: LocalSpaceKind) => Promise<LocalOnboardingSnapshot>
  continue: () => Promise<LocalOnboardingSnapshot>
  refresh: () => Promise<LocalOnboardingSnapshot>
  saveTunnelToken: (input: { token: string }) => Promise<LocalOnboardingSnapshot>
  saveNetworkConfig: (input: LocalOnboardingNetworkConfigInput) => Promise<LocalOnboardingSnapshot>
  testConnectivity: () => Promise<LocalOnboardingSnapshot>
  onStateChange: (callback: (snapshot: LocalOnboardingSnapshot) => void) => () => void
}

export interface XpodDesktopAPI {
  provider: ProviderAPI
  xpod: XpodAPI
  config: ConfigAPI
  supervisor: SupervisorAPI
  dialog: DialogAPI
  app: AppAPI
  auth: AuthAPI
  localOnboarding: LocalOnboardingAPI
}

declare global {
  interface Window {
    xpodDesktop?: XpodDesktopAPI
  }
}
