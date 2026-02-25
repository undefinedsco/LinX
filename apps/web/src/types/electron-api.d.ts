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
  domain: {
    type: 'none' | 'undefineds' | 'custom'
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
  domain?: {
    type: 'none' | 'undefineds' | 'custom'
    value?: string
  }
  tunnelToken?: string
}

export interface XpodStatus {
  running: boolean
  providerId?: string
  port?: number
  baseUrl?: string
  pid?: number
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

export interface XpodDesktopAPI {
  provider: ProviderAPI
  xpod: XpodAPI
  config: ConfigAPI
  supervisor: SupervisorAPI
  dialog: DialogAPI
}

declare global {
  interface Window {
    xpodDesktop?: XpodDesktopAPI
  }
}
