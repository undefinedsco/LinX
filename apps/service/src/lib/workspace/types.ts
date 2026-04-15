export type AuthorizedWorkspaceStatus = 'provisioning' | 'ready' | 'error'
export type AuthorizedWorkspaceSourceKind = 'local-embedded-xpod' | 'remote-solid-pod' | 'unknown'

export interface AuthorizedWorkspacePodMount {
  podName: string
  podBaseUrl: string
  filesPath: string
  targetPath: string
  structuredProjectionPath?: string
}

export interface AuthorizedWorkspaceRecord {
  id: string
  ownerKey: string
  ownerWebId?: string
  label?: string
  xpodBaseUrl: string
  rootPath: string
  finderVisible: boolean
  status: AuthorizedWorkspaceStatus
  podBaseUrls: string[]
  podNames: string[]
  mounts: AuthorizedWorkspacePodMount[]
  createdAt: string
  updatedAt: string
  lastUsedAt: string
  lastError?: string
}

export interface WorkspaceContainerResponse {
  id: string
  title?: string
  backingType: 'pod' | 'folder'
  rootPath: string
  scope: 'whole-root' | 'subfolder'
  status: AuthorizedWorkspaceStatus
  finderVisible: boolean
  ownerKey: string
  ownerWebId?: string
  pod?: {
    mountId: string
    mountPath: string
    podBaseUrls: string[]
    podNames: string[]
  }
  capabilities: {
    mount: boolean
    writable: boolean
    git: boolean
  }
  createdAt: string
  updatedAt: string
  lastUsedAt: string
  lastError?: string
}

export interface CreateAuthorizedWorkspaceInput {
  ownerKey?: string
  ownerWebId?: string
  label?: string
  podBaseUrls?: string[]
  revealInFinder?: boolean
}

export interface AuthorizedWorkspacePrimitive {
  podName: string
  podBaseUrl: string
  filesPath: string
  structuredProjectionPath?: string
}

export interface AuthorizedWorkspaceSnapshot {
  source: AuthorizedWorkspaceSourceKind
  running: boolean
  baseUrl: string
  dataRoot: string
  projectionRoot?: string
  availablePodNames: string[]
}

export interface AuthorizedWorkspaceSource {
  getSnapshot(): AuthorizedWorkspaceSnapshot
  resolveAuthorizedPrimitives(input: {
    ownerWebId?: string
    podBaseUrls?: string[]
  }): {
    snapshot: AuthorizedWorkspaceSnapshot
    primitives: AuthorizedWorkspacePrimitive[]
  }
}
