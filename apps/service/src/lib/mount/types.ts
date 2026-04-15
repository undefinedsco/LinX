export type PodMountStatus = 'provisioning' | 'ready' | 'error'
export type PodMountSourceKind = 'local-embedded-xpod' | 'remote-solid-pod' | 'unknown'

export interface PodMountBinding {
  podName: string
  podBaseUrl: string
  filesPath: string
  targetPath: string
  structuredProjectionPath?: string
}

export interface PodMountRecord {
  id: string
  ownerKey: string
  ownerWebId?: string
  label?: string
  source: PodMountSourceKind
  xpodBaseUrl: string
  rootPath: string
  finderVisible: boolean
  status: PodMountStatus
  podBaseUrls: string[]
  podNames: string[]
  mounts: PodMountBinding[]
  createdAt: string
  updatedAt: string
  lastUsedAt: string
  lastError?: string
}


export interface PodMountLeaseRecord {
  leaseKey: string
  ownerKey: string
  ownerWebId?: string
  mountId?: string
  holderId: string
  acquiredAt: string
  heartbeatAt: string
  expiresAt: string
  mode: 'single-writer'
}

export interface AcquirePodMountLeaseInput {
  ownerKey: string
  ownerWebId?: string
  mountId?: string
  holderId: string
}


export interface PodMountLeaseStatus {
  mode: 'single-writer'
  scope: 'owner-session'
  active: boolean
  expiresAt: string
  ownedByCurrentSession: boolean
}

export interface CreatePodMountInput {
  ownerKey?: string
  ownerWebId?: string
  label?: string
  podBaseUrls?: string[]
  revealInFinder?: boolean
}

export interface PodMountPrimitive {
  podName: string
  podBaseUrl: string
  filesPath: string
  structuredProjectionPath?: string
}

export interface PodMountSnapshot {
  source: PodMountSourceKind
  running: boolean
  baseUrl: string
  dataRoot: string
  projectionRoot?: string
  availablePodNames: string[]
}

export interface ResolveAuthorizedPrimitivesInput {
  ownerWebId?: string
  podBaseUrls?: string[]
}

export interface ResolvedAuthorizedPrimitives {
  snapshot: PodMountSnapshot
  primitives: PodMountPrimitive[]
}

export interface PodMountSource {
  getSnapshot(): PodMountSnapshot
  resolveAuthorizedPrimitives(input: ResolveAuthorizedPrimitivesInput): ResolvedAuthorizedPrimitives
  prepareAuthorizedPrimitives?(input: ResolveAuthorizedPrimitivesInput): Promise<ResolvedAuthorizedPrimitives>
  activateMount?(record: PodMountRecord): Promise<void>
  releaseMount?(record: PodMountRecord): Promise<void>
}
