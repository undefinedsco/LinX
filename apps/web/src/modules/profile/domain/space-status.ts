/**
 * Where the person's data lives and whether anything needs their attention.
 * The rail avatar, the personal card and Settings › 空间与服务 all read this,
 * so they never disagree. Normal state says nothing; a problem gets one line
 * and at most one action.
 */

export type SpaceKind = 'local' | 'standalone' | 'cloud'

export interface SpaceAccountLike {
  issuerUrl?: string
  issuerLabel?: string
  storageProviderUrl?: string
  storageProviderLabel?: string
}

export function resolveSpaceKind(account: SpaceAccountLike | null | undefined): SpaceKind {
  const label = account?.storageProviderLabel?.trim().toLowerCase()
    ?? account?.issuerLabel?.trim().toLowerCase()
  if (label === 'local' || label === '本机空间' || label === '本地空间') return 'local'
  if (label === 'standalone') return 'standalone'

  const providerUrl = account?.storageProviderUrl ?? account?.issuerUrl
  try {
    const hostname = providerUrl ? new URL(providerUrl).hostname : ''
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') return 'standalone'
  } catch {
    // Invalid historical URLs are presented as cloud; login reconciliation removes them.
  }
  return 'cloud'
}

export function spaceKindLabel(kind: SpaceKind): '本机' | '独立' | '云端' {
  if (kind === 'local') return '本机'
  if (kind === 'standalone') return '独立'
  return '云端'
}

export type SpaceAttentionAction = 'open-space-settings' | 'open-local-service' | 'connect-ai'

export interface SpaceAttention {
  kind: 'offline' | 'local-stopped' | 'cannot-save' | 'ai-not-connected'
  /** Rail marker: offline is informational, the rest need the person to act. */
  severity: 'info' | 'action'
  message: string
  action?: { id: SpaceAttentionAction; label: string }
}

export interface SpaceAttentionInput {
  online: boolean
  databaseStatus: 'idle' | 'initializing' | 'ready' | 'error'
  /** `null` while still unknown: say nothing rather than guess. */
  aiConnected: boolean | null
  /**
   * Only for a space on this computer in the desktop app; `null` elsewhere or
   * while still checking.
   */
  localServiceRunning?: boolean | null
}

export function resolveSpaceAttention(input: SpaceAttentionInput): SpaceAttention | null {
  if (!input.online) {
    return { kind: 'offline', severity: 'info', message: '没有网络，修改会在恢复后保存' }
  }
  // A stopped local service is the cause behind "cannot save", so say that.
  if (input.localServiceRunning === false) {
    return {
      kind: 'local-stopped',
      severity: 'action',
      message: '本机空间没有启动',
      action: { id: 'open-local-service', label: '启动' },
    }
  }
  if (input.databaseStatus === 'error') {
    return {
      kind: 'cannot-save',
      severity: 'action',
      message: '暂时不能保存到空间',
      action: { id: 'open-space-settings', label: '查看' },
    }
  }
  if (input.aiConnected === false) {
    return {
      kind: 'ai-not-connected',
      severity: 'action',
      message: 'AI 还没连接',
      action: { id: 'connect-ai', label: '去连接' },
    }
  }
  return null
}

export function canSaveLabel(status: SpaceAttentionInput['databaseStatus']): string {
  if (status === 'ready') return '是'
  if (status === 'error') return '暂时不能'
  return '正在连接…'
}
