import type { ServiceSpaceKind, TunnelProvider } from './types'

export interface ServiceRuntimeStatus {
  launchKind?: string | null
  currentVersion?: string | null
  targetVersion?: string | null
  upgradeAvailable?: boolean
}

export interface ServiceStatus {
  pod?: {
    running?: boolean
    status?: 'starting' | 'running' | 'stopped' | 'error'
    port?: number
    baseUrl?: string
    publicUrl?: string
    localUrl?: string
    pid?: number
    runtime?: ServiceRuntimeStatus
  }
}

export interface ServiceSetupConfigResponse {
  dataDir?: string
  autoStart?: boolean
  spaceKind?: ServiceSpaceKind
  publicDomain?: string
  autoDetectPublicIp?: boolean
  httpsCertPath?: string
  tunnelProvider?: TunnelProvider | ''
  hasTunnelToken?: boolean
}

export function serviceBaseUrl(status: ServiceStatus | null): string {
  return (status?.pod?.publicUrl || status?.pod?.baseUrl || '').replace(/\/+$/, '')
}
